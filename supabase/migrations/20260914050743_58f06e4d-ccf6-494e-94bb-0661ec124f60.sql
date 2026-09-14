ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS time_slots text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS media_path text;