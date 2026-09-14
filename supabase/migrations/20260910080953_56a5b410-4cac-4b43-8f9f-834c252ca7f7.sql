-- Link generations to the character they came from.
ALTER TABLE public.generations
  ADD COLUMN virtual_model_id uuid REFERENCES public.virtual_models(id) ON DELETE SET NULL;
CREATE INDEX generations_virtual_model_idx ON public.generations (virtual_model_id);

-- Character description is always present.
UPDATE public.virtual_models SET description = '' WHERE description IS NULL;
ALTER TABLE public.virtual_models
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN description SET NOT NULL;

-- Backend-only provider credentials store.
CREATE TABLE public.provider_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.provider_secrets TO service_role;
ALTER TABLE public.provider_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.provider_secrets FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE TRIGGER provider_secrets_set_updated_at BEFORE UPDATE ON public.provider_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.get_provider_secret(p_name text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT value FROM public.provider_secrets WHERE name = p_name;
$$;
REVOKE ALL ON FUNCTION public.get_provider_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_provider_secret(p_name text, p_value text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.provider_secrets (name, value) VALUES (p_name, p_value)
  ON CONFLICT (name) DO UPDATE SET value = excluded.value, updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.set_provider_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_provider_secret(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_secret(text, text) TO service_role;

-- Internal helpers must never be callable from the API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_worker_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_exists(text) FROM PUBLIC, anon, authenticated;

-- The queue lease table is service-role only; make that explicit.
CREATE POLICY "runner service role only" ON public.job_runner FOR ALL TO service_role
  USING (true) WITH CHECK (true);
