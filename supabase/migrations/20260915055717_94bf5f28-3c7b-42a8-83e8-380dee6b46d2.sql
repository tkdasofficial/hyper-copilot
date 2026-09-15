ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS publish_at timestamptz;
UPDATE public.workflows SET publish_at = next_due_at WHERE publish_at IS NULL AND next_due_at IS NOT NULL;