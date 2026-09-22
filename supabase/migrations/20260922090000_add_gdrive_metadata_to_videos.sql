-- Add lightweight Google Drive metadata columns to videos table
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS file_id text,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS direct_download_url text;
