import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { visualStylePrompt } from "@/lib/style-presets";

export type VideoAgentConfig = {
  prompt: string;
  negative_prompt: string;
  voice_gender: string;
  voice_persona: string;
  voice_speed: number;
  voice_pitch: number;
  image_style: string;
  motion_template: string;
  captions: boolean;
  caption_style: string;
  caption_scale: number;
  aspect_ratio: string;
  quality: string;
  bitrate: string;
  duration_seconds: number;
};

function validate(input: VideoAgentConfig): VideoAgentConfig {
  if (!input || typeof input.prompt !== "string" || !input.prompt.trim()) {
    throw new Error("A prompt is required");
  }
  const duration = Math.round(Number(input.duration_seconds ?? 15));
  const scale = Math.round(Number(input.caption_scale ?? 4));
  return {
    duration_seconds: Math.min(60, Math.max(1, Number.isFinite(duration) ? duration : 15)),
    prompt: input.prompt.trim().slice(0, 4000),
    negative_prompt: String(input.negative_prompt ?? "").slice(0, 2000),
    voice_gender: String(input.voice_gender ?? "male").toLowerCase(),
    voice_persona: String(input.voice_persona ?? "Cinematic Narrator"),
    voice_speed: Number(input.voice_speed ?? 110),
    voice_pitch: Number(input.voice_pitch ?? 52),
    image_style: String(input.image_style ?? visualStylePrompt("Photorealistic", "Natural Sunlight")),
    motion_template: String(input.motion_template ?? "Auto Zoom-In"),
    captions: Boolean(input.captions),
    caption_style: String(input.caption_style ?? "Neon Glow"),
    caption_scale: Math.min(10, Math.max(1, Number.isFinite(scale) ? scale : 4)),
    aspect_ratio: input.aspect_ratio === "16:9" ? "16:9" : "9:16",
    quality: input.quality === "720p" ? "720p" : "1080p",
    bitrate: input.bitrate === "Standard" ? "Standard" : "High",
  };
}

/**
 * Records a Video Agent request as a pending `videos` row — nothing more.
 *
 * The database trigger on that insert hands the row to the server pipeline,
 * which reserves the credit and asks the GitHub Actions render pipeline to
 * build it. The pipeline writes progress back into the same row, which the
 * page follows over Supabase Realtime. No step depends on this browser session.
 */
export const startVideoRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { createVideoRequest } = await import("@/lib/video-agent.server");
    const videoId = await createVideoRequest(context.supabase, context.userId, data);
    return { videoId };
  });

/**
 * Stage 3/4 bridge: the pipeline stores the finished MP4 in the private
 * `videos` storage bucket under `<user_id>/<video_id>.mp4`. The page asks for a
 * short-lived signed URL so playback and download work without a public bucket.
 */
export const getVideoPlaybackUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { videoId: string }) => {
    if (!input?.videoId) throw new Error("A video id is required");
    return { videoId: String(input.videoId) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: row } = await supabase
      .from("videos")
      .select("video_url")
      .eq("id", data.videoId)
      .eq("user_id", userId)
      .maybeSingle();

    const stored = row?.video_url ?? null;
    if (!stored) return { url: null };
    if (/^https?:\/\//i.test(stored)) return { url: stored };

    const path = stored.replace(/^videos\//, "");
    const { data: signed } = await supabase.storage
      .from("videos")
      .createSignedUrl(path, 60 * 60 * 6);

    return { url: signed?.signedUrl ?? null };
  });
