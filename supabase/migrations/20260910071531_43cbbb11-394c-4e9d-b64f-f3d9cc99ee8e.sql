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
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX videos_user_created_idx ON public.videos (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own videos" ON public.videos
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER videos_set_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.videos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.videos;