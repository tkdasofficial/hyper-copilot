import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GITHUB_DISPATCH_EVENT,
  GITHUB_DISPATCH_URL,
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
} from "../../supabase/config/config";

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
  return {
    duration_seconds: Math.min(60, Math.max(1, Number.isFinite(duration) ? duration : 15)),
    prompt: input.prompt.trim().slice(0, 4000),
    negative_prompt: String(input.negative_prompt ?? "").slice(0, 2000),
    voice_gender: String(input.voice_gender ?? "male").toLowerCase(),
    voice_persona: String(input.voice_persona ?? "Cinematic Narrator"),
    voice_speed: Number(input.voice_speed ?? 110),
    voice_pitch: Number(input.voice_pitch ?? 52),
    image_style: String(input.image_style ?? "Cinematic 3D"),
    motion_template: String(input.motion_template ?? "Auto Zoom-In"),
    captions: Boolean(input.captions),
    caption_style: String(input.caption_style ?? "Neon Glow"),
    aspect_ratio: input.aspect_ratio === "16:9" ? "16:9" : "9:16",
    quality: input.quality === "720p" ? "720p" : "1080p",
    bitrate: input.bitrate === "Standard" ? "Standard" : "High",
  };
}

/**
 * Creates the pending `videos` row for a Video Agent request and asks the
 * GitHub Actions pipeline (`.github/workflows/video-agent.yml`) to build it.
 *
 * The workflow, not the app, talks to Cloudflare Workers AI / Pixazo / FFmpeg
 * and writes progress back into the same row, which the page follows over
 * Supabase Realtime.
 */
export const startVideoRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // a. Credit check + deduction (video credits first, then the monthly quota).
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("monthly_quota, credits_used, video_credits")
      .eq("user_id", userId)
      .maybeSingle();

    if (!sub) throw new Error("No active plan was found on your account.");

    const videoCredits = sub.video_credits ?? 0;
    const remainingQuota = Math.max((sub.monthly_quota ?? 0) - (sub.credits_used ?? 0), 0);

    if (videoCredits <= 0 && remainingQuota <= 0) {
      throw new Error("You are out of render credits. Upgrade your plan to keep creating videos.");
    }

    const spend =
      videoCredits > 0
        ? { video_credits: videoCredits - 1 }
        : { credits_used: (sub.credits_used ?? 0) + 1 };

    const { error: spendError } = await supabase
      .from("subscriptions")
      .update(spend)
      .eq("user_id", userId);

    if (spendError) throw new Error("Could not reserve a render credit. Please try again.");

    const refund = async () => {
      await supabase
        .from("subscriptions")
        .update(
          videoCredits > 0
            ? { video_credits: videoCredits }
            : { credits_used: sub.credits_used ?? 0 },
        )
        .eq("user_id", userId);
    };

    // b + c. Pending row, then keep its id for the pipeline payload.
    const { data: row, error } = await supabase
      .from("videos")
      .insert({ ...data, user_id: userId, status: "pending", step: "queued", progress: 0 })
      .select("id")
      .single();

    if (error || !row) {
      await refund();
      throw new Error(error?.message ?? "Could not create the video record");
    }

    const videoId = row.id as string;
    const token = (process.env["GITHUB_PAT"] ?? "").trim();

    const fail = async (message: string) => {
      await supabase.from("videos").update({ status: "failed", error: message }).eq("id", videoId);
      await refund();
      throw new Error(message);
    };

    if (!token) {
      await fail(
        `The Video Engine access token is not configured yet. Add the GITHUB_PAT secret with access to ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}.`,
      );
    }

    // d. repository_dispatch into the external Video Engine repository.
    const res = await fetch(GITHUB_DISPATCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "hyper-copilot-video-agent",
      },
      body: JSON.stringify({
        event_type: GITHUB_DISPATCH_EVENT,
        client_payload: {
          video_id: videoId,
          user_id: userId,
          prompt: data.prompt,
          negative_prompt: data.negative_prompt,
          voice_gender: data.voice_gender,
          image_style: data.image_style,
          aspect_ratio: data.aspect_ratio,
          duration_seconds: String(data.duration_seconds),
          captions: data.captions ? "true" : "false",
        },
      }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      await fail(`The render pipeline refused the job (${res.status}). ${detail}`);
    }

    await supabase
      .from("videos")
      .update({ status: "processing", step: "Initializing Video Engine" })
      .eq("id", videoId);

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
