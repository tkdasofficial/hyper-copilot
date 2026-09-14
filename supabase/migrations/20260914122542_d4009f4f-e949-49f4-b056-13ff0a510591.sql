ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS hook_title text,
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}'::text[];