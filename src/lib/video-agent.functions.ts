import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { visualStylePrompt } from "@/lib/style-presets";

export type VideoAgentConfig = {
  mode?: "short" | "long";
  prompt: string;
  negative_prompt?: string;
  category?: string;
  visual_style?: string;
  resolution?: string;
  fps?: string;
  bgm?: boolean;
  captions?: boolean;
  caption_style?: string;
  caption_size?: string;
  voice_gender?: string;
  voice_persona?: string;
  voice_speed?: number;
  voice_pitch?: number;
  image_style?: string;
  motion_template?: string;
  caption_scale?: number;
  aspect_ratio?: string;
  quality?: string;
  bitrate?: string;
  duration_seconds?: number;
  duration_minutes?: number;
};

function validate(input: VideoAgentConfig): VideoAgentConfig {
  if (!input || typeof input.prompt !== "string" || !input.prompt.trim()) {
    throw new Error("A prompt or documentary idea is required");
  }
  const isLong =
    input.mode === "long" || input.aspect_ratio === "16:9" || Number(input.duration_seconds) > 60;
  const maxDuration = isLong ? 900 : 60;
  const rawDuration = Math.round(
    Number(
      input.duration_seconds ??
        (input.duration_minutes ? Number(input.duration_minutes) * 60 : isLong ? 180 : 15),
    ),
  );
  const scale =
    input.caption_size === "Small"
      ? 2
      : input.caption_size === "Large"
        ? 6
        : Math.round(Number(input.caption_scale ?? 4));

  return {
    mode: isLong ? "long" : "short",
    duration_seconds: Math.min(
      maxDuration,
      Math.max(1, Number.isFinite(rawDuration) ? rawDuration : isLong ? 180 : 15),
    ),
    duration_minutes: input.duration_minutes
      ? Math.min(15, Math.max(1, Math.round(input.duration_minutes)))
      : Math.round(rawDuration / 60),
    prompt: input.prompt.trim().slice(0, 4000),
    negative_prompt: String(input.negative_prompt ?? "").slice(0, 2000),
    category: input.category || input.voice_persona || "Documentary",
    visual_style: input.visual_style || input.image_style || "Cinematic",
    resolution: input.resolution || input.quality || "1080p",
    fps: input.fps || (input.bitrate?.includes("30") ? "30" : "60"),
    bgm: input.bgm !== false && input.motion_template !== "bgm_off",
    voice_gender: String(input.voice_gender ?? "male").toLowerCase(),
    voice_persona: String(
      input.category ?? input.voice_persona ?? (isLong ? "Documentary" : "Cinematic Narrator"),
    ),
    voice_speed: Number(input.voice_speed ?? 110),
    voice_pitch: Number(input.voice_pitch ?? 52),
    image_style: String(input.visual_style ?? input.image_style ?? "Cinematic"),
    motion_template: input.bgm === false ? "bgm_off" : String(input.motion_template ?? "bgm_on"),
    captions: Boolean(input.captions),
    caption_style: String(input.caption_style ?? "Dynamic"),
    caption_scale: Math.min(10, Math.max(1, Number.isFinite(scale) ? scale : 4)),
    caption_size: input.caption_size || (scale <= 2 ? "Small" : scale <= 4 ? "Medium" : "Large"),
    aspect_ratio: input.aspect_ratio === "16:9" || isLong ? "16:9" : "9:16",
    quality: input.resolution === "720p" || input.quality === "720p" ? "720p" : "1080p",
    bitrate: input.fps ? `${input.fps} FPS` : (input.bitrate ?? "60 FPS"),
  };
}

/**
 * Records a Video Agent request as a pending `videos` row — nothing more.
 *
 * The database trigger on that insert hands the row to the server pipeline,
 * which reserves the credit and asks the external render service to
 * build it. The pipeline writes progress back into the same row, which the
 * page follows over Supabase Realtime. No step depends on this browser session.
 */
export const startVideoRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { createVideoRequest, dispatchVideoRender } = await import("@/lib/video-agent.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const videoId = await createVideoRequest(context.supabase, context.userId, data);

    // Standardize direct backend invocation to the edge function
    dispatchVideoRender(supabaseAdmin, videoId).catch((err) => {
      console.warn("[VideoAgent] Async render dispatch error:", err);
    });

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
      .select("video_url, direct_download_url")
      .eq("id", data.videoId)
      .eq("user_id", userId)
      .maybeSingle();

    const direct = row?.direct_download_url ?? null;
    if (direct && /^https?:\/\//i.test(direct)) return { url: direct };

    const stored = row?.video_url ?? null;
    if (!stored) return { url: null };
    if (/^https?:\/\//i.test(stored)) return { url: stored };

    const path = stored.replace(/^videos\//, "");
    const { data: signed } = await supabase.storage
      .from("videos")
      .createSignedUrl(path, 60 * 60 * 6);

    return { url: signed?.signedUrl ?? null };
  });
