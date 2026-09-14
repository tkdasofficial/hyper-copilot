-- lovable-cron-fallback-reviewed: 1440 runs/day; scheduled social posts are minute-precise wall-clock times that no row-change trigger can fire, and the same tick resumes retries/polls whose original run was lost. All instant work is trigger-driven; the cron makes an HTTP call only when a WHERE EXISTS check finds something due, so idle minutes are a single index lookup.

ALTER TABLE public.job_runner ADD COLUMN IF NOT EXISTS app_base_url text;

UPDATE public.job_runner
SET app_base_url = 'https://project--6472c287-ad00-4ca1-89bf-11646c8f4d5d-dev.lovable.app'
WHERE id = 'default'
  AND (app_base_url IS NULL OR app_base_url LIKE '%efea8b00%');

UPDATE public.job_runner
SET worker_token = encode(gen_random_bytes(24), 'hex')
WHERE id = 'default' AND worker_token IS NULL;

-- Reclaim tasks whose worker died mid-run (lease expired) instead of leaving them stuck.
CREATE OR REPLACE FUNCTION public.claim_jobs(p_limit integer, p_lease_seconds integer)
RETURNS SETOF public.jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.jobs j
  SET status = 'running',
      attempts = j.attempts + 1,
      lease_until = now() + make_interval(secs => p_lease_seconds)
  WHERE j.id IN (
    SELECT id FROM public.jobs
    WHERE (
        (status = 'queued' AND next_run_at <= now() AND (lease_until IS NULL OR lease_until < now()))
        OR (status = 'running' AND lease_until IS NOT NULL AND lease_until < now())
      )
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING j.*;
$$;

-- Central, secret-bearing call into the app's server-side pipeline routes.
CREATE OR REPLACE FUNCTION public.pipeline_dispatch(p_path text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_token text;
  v_id bigint;
BEGIN
  SELECT app_base_url, worker_token INTO v_url, v_token
  FROM public.job_runner WHERE id = 'default';
  IF v_url IS NULL OR v_token IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url := rtrim(v_url, '/') || p_path,
    body := COALESCE(p_body, '{}'::jsonb),
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_token),
    timeout_milliseconds := 600000
  ) INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pipeline_dispatch % failed: %', p_path, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_dispatch(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pipeline_dispatch(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_dispatch(text, jsonb) TO service_role;

-- 1. New queued task -> job worker.
CREATE OR REPLACE FUNCTION public.jobs_dispatch_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'queued' THEN
    PERFORM public.pipeline_dispatch(
      '/api/public/jobs/worker',
      jsonb_build_object('source', 'job-insert', 'job_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_dispatch_worker ON public.jobs;
CREATE TRIGGER jobs_dispatch_worker
AFTER INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_dispatch_worker();

-- 2. New video request -> render dispatcher; finished render -> workflow publisher.
CREATE OR REPLACE FUNCTION public.videos_dispatch_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      PERFORM public.pipeline_dispatch(
        '/api/public/pipeline/render',
        jsonb_build_object('source', 'video-insert', 'video_id', NEW.id)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('completed', 'failed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.workflows
    SET next_due_at = now(), lock_until = NULL
    WHERE pending_video_id = NEW.id AND run_state = 'rendering';
    IF FOUND THEN
      PERFORM public.pipeline_dispatch(
        '/api/public/workflows/scheduler',
        jsonb_build_object('source', 'video-' || NEW.status, 'video_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videos_dispatch_pipeline ON public.videos;
CREATE TRIGGER videos_dispatch_pipeline
AFTER INSERT OR UPDATE OF status ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.videos_dispatch_pipeline();

-- 3. "Run now" request -> workflow publisher.
CREATE OR REPLACE FUNCTION public.workflows_dispatch_scheduler()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.run_state = 'requested' AND OLD.run_state IS DISTINCT FROM 'requested' THEN
    PERFORM public.pipeline_dispatch(
      '/api/public/workflows/scheduler',
      jsonb_build_object('source', 'run-now', 'workflow_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflows_dispatch_scheduler ON public.workflows;
CREATE TRIGGER workflows_dispatch_scheduler
AFTER UPDATE OF run_state ON public.workflows
FOR EACH ROW EXECUTE FUNCTION public.workflows_dispatch_scheduler();

-- 4. Single safety-net tick: only calls the app when something is actually due.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hyper-workflow-scheduler') THEN
    PERFORM cron.unschedule('hyper-workflow-scheduler');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hyper-jobs-worker') THEN
    PERFORM cron.unschedule('hyper-jobs-worker');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hyper-pipeline-tick') THEN
    PERFORM cron.unschedule('hyper-pipeline-tick');
  END IF;

  PERFORM cron.schedule(
    'hyper-pipeline-tick',
    '* * * * *',
    $cron$
      SELECT public.pipeline_dispatch('/api/public/pipeline/tick', '{"source":"cron"}'::jsonb)
      WHERE EXISTS (
          SELECT 1 FROM public.jobs
          WHERE (status = 'queued' AND next_run_at <= now() + interval '60 seconds')
             OR (status = 'running' AND lease_until < now())
        )
        OR EXISTS (
          SELECT 1 FROM public.workflows
          WHERE next_due_at <= now() + interval '60 seconds'
            AND (enabled OR run_state <> 'idle')
        )
        OR EXISTS (
          SELECT 1 FROM public.videos
          WHERE status = 'pending' AND step = 'queued'
            AND created_at < now() - interval '30 seconds'
        );
    $cron$
  );
END $$;