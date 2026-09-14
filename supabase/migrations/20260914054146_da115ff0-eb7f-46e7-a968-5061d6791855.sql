-- lovable-cron-fallback-reviewed: 288 runs/day; scheduled posts are minute-precise (e.g. 9:00 AM) and each due workflow must render a video then publish it, so due schedules must be picked up within 5 minutes.
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS creation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tz_offset integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS run_state text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS pending_video_id uuid,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lock_until timestamptz;

CREATE INDEX IF NOT EXISTS workflows_next_due_idx ON public.workflows (next_due_at) WHERE enabled;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

UPDATE public.job_runner
SET worker_token = encode(gen_random_bytes(24), 'hex')
WHERE id = 'default' AND worker_token IS NULL;

DO $$
DECLARE
  v_token text;
BEGIN
  SELECT worker_token INTO v_token FROM public.job_runner WHERE id = 'default';

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hyper-workflow-scheduler') THEN
    PERFORM cron.unschedule('hyper-workflow-scheduler');
  END IF;

  PERFORM cron.schedule(
    'hyper-workflow-scheduler',
    '*/5 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://project--efea8b00-3f99-421b-8d1c-1d9462eef54c-dev.lovable.app/api/public/workflows/scheduler',
        headers := jsonb_build_object('content-type','application/json','x-worker-secret',%L),
        body := '{}'::jsonb
      );
    $cmd$, v_token)
  );
END $$;