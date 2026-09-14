-- ============ shared helpers ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  role text,
  purpose text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ subscriptions ============
CREATE TYPE public.plan_tier AS ENUM ('free', 'pro', 'unlimited');

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier public.plan_tier NOT NULL DEFAULT 'free',
  payment_status text NOT NULL DEFAULT 'none',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  image_credits integer NOT NULL DEFAULT 30,
  video_credits integer NOT NULL DEFAULT 3,
  audio_credits integer NOT NULL DEFAULT 10,
  monthly_quota integer NOT NULL DEFAULT 30,
  credits_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscription read" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ signup trigger ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ generations ============
CREATE TABLE public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  model text NOT NULL DEFAULT '',
  prompt text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'completed',
  storage_path text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generations_user_created_idx ON public.generations (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generations TO authenticated;
GRANT ALL ON public.generations TO service_role;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own generations" ON public.generations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER generations_set_updated_at BEFORE UPDATE ON public.generations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ virtual models ============
CREATE TABLE public.virtual_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid,
  name text NOT NULL DEFAULT '',
  description text,
  identity_prompt text NOT NULL DEFAULT '',
  seed bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  error text,
  headshot_path text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX virtual_models_user_created_idx ON public.virtual_models (user_id, created_at DESC);
CREATE INDEX virtual_models_job_idx ON public.virtual_models (job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.virtual_models TO authenticated;
GRANT ALL ON public.virtual_models TO service_role;
ALTER TABLE public.virtual_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own virtual models" ON public.virtual_models FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER virtual_models_set_updated_at BEFORE UPDATE ON public.virtual_models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ videos (Video Agent) ============
CREATE TABLE public.videos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt text NOT NULL DEFAULT '',
  negative_prompt text NOT NULL DEFAULT '',
  voice_gender text NOT NULL DEFAULT 'male',
  voice_persona text NOT NULL DEFAULT 'Cinematic Narrator',
  voice_speed integer NOT NULL DEFAULT 110,
  voice_pitch integer NOT NULL DEFAULT 52,
  image_style text NOT NULL DEFAULT 'Cinematic 3D',
  motion_template text NOT NULL DEFAULT 'Auto Zoom-In',
  captions boolean NOT NULL DEFAULT true,
  caption_style text NOT NULL DEFAULT 'Neon Glow',
  aspect_ratio text NOT NULL DEFAULT '9:16',
  quality text NOT NULL DEFAULT '1080p',
  bitrate text NOT NULL DEFAULT 'High',
  status text NOT NULL DEFAULT 'pending',
  step text,
  progress integer NOT NULL DEFAULT 0,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX videos_user_created_idx ON public.videos (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own videos" ON public.videos FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER videos_set_updated_at BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.videos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.videos;

-- ============ background job queue ============
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  generation_id uuid,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  lease_until timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX jobs_user_created_idx ON public.jobs (user_id, created_at DESC);
CREATE INDEX jobs_due_idx ON public.jobs (status, next_run_at);
GRANT SELECT, INSERT, UPDATE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs read" ON public.jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own jobs insert" ON public.jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own jobs update" ON public.jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER jobs_set_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.job_runner (
  id text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  paused_at timestamptz,
  lock_until timestamptz,
  worker_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.job_runner TO service_role;
ALTER TABLE public.job_runner ENABLE ROW LEVEL SECURITY;
INSERT INTO public.job_runner (id) VALUES ('default');
CREATE TRIGGER job_runner_set_updated_at BEFORE UPDATE ON public.job_runner
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Claims due jobs for exactly one worker run.
CREATE OR REPLACE FUNCTION public.claim_jobs(p_limit integer, p_lease_seconds integer)
RETURNS SETOF public.jobs
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.jobs j
  SET status = 'running',
      attempts = j.attempts + 1,
      lease_until = now() + make_interval(secs => p_lease_seconds)
  WHERE j.id IN (
    SELECT id FROM public.jobs
    WHERE status = 'queued'
      AND next_run_at <= now()
      AND (lease_until IS NULL OR lease_until < now())
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING j.*;
$$;
REVOKE ALL ON FUNCTION public.claim_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(integer, integer) TO service_role;

-- Scheduled worker runs authenticate with a token stored only in the database.
CREATE OR REPLACE FUNCTION public.verify_worker_token(p_token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_runner
    WHERE id = 'default' AND worker_token IS NOT NULL AND worker_token = p_token
  );
$$;
REVOKE ALL ON FUNCTION public.verify_worker_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_worker_token(text) TO service_role;

-- Non-enumerable email lookup for the two-step sign-in form (service role only).
CREATE OR REPLACE FUNCTION public.email_exists(check_email text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(check_email));
$$;
REVOKE ALL ON FUNCTION public.email_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO service_role;

-- ============ storage policies for generated media ============
CREATE POLICY "own generation files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('generations','virtual-models') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own generation files write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('generations','virtual-models') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own generation files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('generations','virtual-models') AND (storage.foldername(name))[1] = auth.uid()::text);
