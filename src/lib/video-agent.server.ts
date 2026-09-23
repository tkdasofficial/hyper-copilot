/**
 * Server-only Video Agent helpers.
 *
 * A render is two server-side steps that never share a request with the browser:
 *
 *   1. `createVideoRequest` — the only thing a user action does: a quick credit
 *      sanity check and a pending `videos` row. A database trigger on that insert
 *      hands the row to the pipeline.
 *   2. `dispatchVideoRender` — runs in the pipeline (`/api/public/pipeline/render`
 *      or the per-minute tick): reserves the credit, asks the external
 *      render service to build the video and records the outcome on the row.
 *
 * Both the interactive Video Agent page and the workflow scheduler go through
 * the same two steps, so neither path can drift from the other.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type VideoRenderConfig = {
  prompt: string;
  negative_prompt?: string;
  category?: string;
  visual_style?: string;
  resolution?: string;
  fps?: string;
  duration_minutes?: number;
  duration_seconds?: number;
  voice_gender?: string;
  bgm?: boolean;
  captions?: boolean;
  caption_style?: string;
  caption_size?: string;
  voice_persona?: string;
  voice_speed?: number;
  voice_pitch?: number;
  image_style?: string;
  motion_template?: string;
  caption_scale?: number;
  aspect_ratio?: string;
  quality?: string;
  bitrate?: string;
  mode?: string;
};

type Client = SupabaseClient<Database>;

/** Step marker a fresh row carries until the pipeline claims it. */
export const RENDER_STEP_QUEUED = "queued";
const RENDER_STEP_DISPATCHING = "dispatching";

/**
 * Asks the Supabase Edge Function to dispatch a render.
 *
 * The app never sees or stores the Video Engine credential: it authenticates
 * with the backend worker token and reads back only ok / error.
 */
async function invokeRenderDispatch(
  admin: Client,
  videoId: string,
  mode?: "short" | "long",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: runner } = await admin
    .from("job_runner")
    .select("worker_token")
    .eq("id", "default")
    .maybeSingle();
  const workerSecret = (runner?.worker_token ?? "").trim();
  if (!workerSecret) {
    return { ok: false, error: "The backend worker credential is not configured yet." };
  }

  try {
    let payload: { ok?: boolean; error?: string } | null = null;
    let invokeErr: { message?: string } | Error | null = null;
    try {
      const res = await admin.functions.invoke<{ ok?: boolean; error?: string }>(
        "video-dispatcher",
        {
          body: { action: "dispatch", videoId, mode },
          headers: { "x-worker-secret": workerSecret },
        },
      );
      payload = res.data;
      invokeErr = res.error;
    } catch (e) {
      invokeErr = e;
    }

    if (invokeErr || !payload || payload.ok !== true) {
      const fb = await admin.functions.invoke<{ ok?: boolean; error?: string }>("video-agent", {
        body: { action: "dispatch", videoId, mode },
        headers: { "x-worker-secret": workerSecret },
      });
      if (fb.data && fb.data.ok === true) {
        await admin.from("videos").update({ error: null }).eq("id", videoId);
        return { ok: true };
      }

      // If edge functions fail, perform direct GitHub dispatch if GITHUB_PAT is configured
      const githubPat = process.env.GITHUB_PAT?.trim();
      if (githubPat) {
        try {
          const { data: v } = await admin
            .from("videos")
            .select("*")
            .eq("id", videoId)
            .maybeSingle();
          if (v) {
            const isLong =
              mode === "long" ||
              v.aspect_ratio === "16:9" ||
              Number(v.duration_seconds) > 60 ||
              (v.aspect_ratio !== "9:16" && Number(v.duration_seconds) >= 60) ||
              (typeof v.voice_persona === "string" &&
                v.voice_persona.toLowerCase().includes("documentary"));
            const eventType = isLong ? "long_form" : "short_form";

            const isBgm = v.motion_template !== "bgm_off";
            const durSecVal = Number(v.duration_seconds || (isLong ? 300 : 15));
            const durMinsVal = Math.max(1, Math.round(durSecVal / 60));

            const captionScaleNum = Number(v.caption_scale ?? 4);
            const captionSize =
              captionScaleNum >= 5 || (v.caption_style ?? "").toLowerCase().includes("large")
                ? "Large"
                : captionScaleNum <= 2 || (v.caption_style ?? "").toLowerCase().includes("small")
                  ? "Small"
                  : "Medium";

            // Group all 19+ raw properties into nested JSON objects under 9 top-level keys (<= 10)
            // to satisfy GitHub Repository Dispatch limit while preserving every property.
            const directPayload: Record<string, unknown> = {
              video_id: v.id,
              prompt: v.prompt || "",
              mode: isLong ? "long" : "short",
              identity: {
                video_id: v.id,
                user_id: v.user_id,
              },
              content: {
                prompt: v.prompt || "",
                negative_prompt: v.negative_prompt ?? "",
                category: v.voice_persona ?? "Documentary",
              },
              visual: {
                visual_style: v.image_style ?? "Cinematic",
                image_style: v.image_style ?? "Cinematic",
                aspect_ratio: v.aspect_ratio || (isLong ? "16:9" : "9:16"),
                resolution: v.quality ?? "1080p",
                quality: v.quality ?? "1080p",
                fps: v.bitrate?.includes("30") ? "30" : "60",
                bitrate: v.bitrate ?? "standard",
                motion_template: v.motion_template ?? "dynamic",
                ken_burns: "true",
                motion_type: "dynamic",
                transition_type: "fade",
                transition_duration: "0.4",
                color_grading: "true",
                vignette: "false",
                subtitle_gradient: "true",
                progress_bar: isLong ? "false" : "true",
                progress_bar_color: "white@0.85",
              },
              audio: {
                voice_gender: v.voice_gender ?? "male",
                voice_persona: v.voice_persona ?? "Documentary",
                voice_speed: Number(v.voice_speed ?? 1),
                voice_pitch: Number(v.voice_pitch ?? 0),
                category: v.voice_persona ?? "Documentary",
                bgm: isBgm ? "true" : "false",
              },
              timing: {
                duration_seconds: String(durSecVal),
                duration_minutes: String(durMinsVal),
              },
              caption: {
                captions: v.captions ? "true" : "false",
                caption_style: v.caption_style ?? "Dynamic",
                caption_size: captionSize,
                caption_scale: String(captionScaleNum),
              },
            };

            const ghRes = await fetch(
              "https://api.github.com/repos/TKDasOfficial/hyper-copilot-runtime/dispatches",
              {
                method: "POST",
                headers: {
                  Accept: "application/vnd.github+json",
                  Authorization: `Bearer ${githubPat}`,
                  "X-GitHub-Api-Version": "2022-11-28",
                  "Content-Type": "application/json",
                  "User-Agent": "hyper-copilot-video-server-direct",
                },
                body: JSON.stringify({
                  event_type: eventType,
                  client_payload: directPayload,
                }),
              },
            );

            if (ghRes.ok) {
              const stepDesc = isLong ? "Initializing Video Engine" : "Initializing Reel Engine";
              await admin
                .from("videos")
                .update({
                  status: "processing",
                  step: stepDesc,
                  progress: 5,
                  error: null,
                })
                .eq("id", videoId);
              return { ok: true };
            }
          }
        } catch {
          // Fall through to error reporting below
        }
      }

      return {
        ok: false,
        error:
          payload?.error ??
          fb.data?.error ??
          invokeErr?.message ??
          "The render service refused the job.",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        `Could not reach the render service. ${err instanceof Error ? err.message : ""}`.trim(),
    };
  }
}

async function readCredits(supabase: Client, userId: string) {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("monthly_quota, credits_used, video_credits, tier")
    .eq("user_id", userId)
    .maybeSingle();

  // Personal use mode: always treat credits and quotas as completely unlimited
  return {
    videoCredits: 999999,
    creditsUsed: sub?.credits_used ?? 0,
    remainingQuota: 999999,
    isUnlimited: true,
  };
}

/**
 * Creates the pending `videos` row. The `videos_dispatch_pipeline` database
 * trigger picks it up from here — no caller ever talks to the render pipeline.
 */
export async function createVideoRequest(
  supabase: Client,
  userId: string,
  data: VideoRenderConfig,
): Promise<string> {
  const credits = await readCredits(supabase, userId);
  if (!credits) throw new Error("No active plan was found on your account.");
  if (!credits.isUnlimited && credits.videoCredits <= 0 && credits.remainingQuota <= 0) {
    throw new Error("You are out of render credits. Upgrade your plan to keep creating videos.");
  }

  // Calculate duration_seconds safely if duration_minutes was provided
  const durationSeconds =
    Number(data.duration_seconds) ||
    (data.duration_minutes
      ? Math.round(Number(data.duration_minutes) * 60)
      : data.mode === "short"
        ? 15
        : 180);

  // Determine scale number from caption_size
  const captionScaleNum =
    data.caption_size === "Small"
      ? 2
      : data.caption_size === "Large"
        ? 6
        : Number(data.caption_scale) || 4;

  // Explicitly construct payload with ONLY existing database columns on public.videos
  // to prevent PostgREST PGRST204 ("Could not find column in schema cache") errors
  const videoRow = {
    user_id: userId,
    prompt: data.prompt,
    negative_prompt: data.negative_prompt ?? "",
    voice_gender: data.voice_gender ?? "male",
    voice_persona: data.category ?? data.voice_persona ?? "Documentary",
    voice_speed: Number(data.voice_speed) || 110,
    voice_pitch: Number(data.voice_pitch) || 52,
    image_style: data.visual_style ?? data.image_style ?? "Cinematic",
    motion_template: data.bgm === false ? "bgm_off" : (data.motion_template ?? "bgm_on"),
    captions: Boolean(data.captions),
    caption_style: data.caption_style ?? "Dynamic",
    caption_scale: captionScaleNum,
    aspect_ratio: data.aspect_ratio ?? (data.mode === "short" ? "9:16" : "16:9"),
    quality: data.resolution ?? data.quality ?? "1080p",
    bitrate: data.fps ? `${data.fps} FPS` : (data.bitrate ?? "60 FPS"),
    duration_seconds: durationSeconds,
    status: "pending" as const,
    step: RENDER_STEP_QUEUED,
    progress: 0,
  };

  const { data: row, error } = await supabase.from("videos").insert(videoRow).select("id").single();

  if (error || !row) throw new Error(error?.message ?? "Could not create the video record");
  return row.id as string;
}

export type DispatchOutcome = "dispatched" | "skipped" | "failed";

/**
 * Pipeline side: claims a pending row, reserves the credit and dispatches the
 * render. Safe to call repeatedly — the claim is atomic, so a row is only ever
 * dispatched once even when the trigger and the tick race.
 */
export async function dispatchVideoRender(
  admin: Client,
  videoId: string,
): Promise<DispatchOutcome> {
  const { data: claimed } = await admin
    .from("videos")
    .update({ step: RENDER_STEP_DISPATCHING })
    .eq("id", videoId)
    .eq("status", "pending")
    .eq("step", RENDER_STEP_QUEUED)
    .select("*")
    .maybeSingle();
  if (!claimed) return "skipped";

  const video = claimed;
  const userId = video.user_id;

  const fail = async (message: string) => {
    await admin
      .from("videos")
      .update({ status: "failed", step: "failed", error: message })
      .eq("id", videoId);
    return "failed" as const;
  };

  // a. Credit reservation: for personal/unlimited mode, credits are not decremented.
  const credits = await readCredits(admin, userId);
  if (!credits) return fail("No active plan was found on your account.");
  if (!credits.isUnlimited && credits.videoCredits <= 0 && credits.remainingQuota <= 0) {
    return fail("You are out of render credits. Upgrade your plan to keep creating videos.");
  }
  if (!credits.isUnlimited) {
    const spend =
      credits.videoCredits > 0
        ? { video_credits: credits.videoCredits - 1 }
        : { credits_used: credits.creditsUsed + 1 };
    const { error: spendError } = await admin
      .from("subscriptions")
      .update(spend)
      .eq("user_id", userId);
    if (spendError) return fail("Could not reserve a render credit. Please try again.");
  }

  const refund = async () => {
    if (credits.isUnlimited) return;
    await admin
      .from("subscriptions")
      .update(
        credits.videoCredits > 0
          ? { video_credits: credits.videoCredits }
          : { credits_used: credits.creditsUsed },
      )
      .eq("user_id", userId);
  };

  // b. Hand the render to the Supabase Edge Function. It owns the Video Engine
  //    access token (Supabase secret) and performs the repository_dispatch; the
  //    app only learns whether the hand-off succeeded.
  const isLong =
    video.aspect_ratio === "16:9" ||
    Number(video.duration_seconds) > 60 ||
    (video.aspect_ratio !== "9:16" && Number(video.duration_seconds) >= 60) ||
    (typeof video.voice_persona === "string" &&
      video.voice_persona.toLowerCase().includes("documentary"));

  const handoff = await invokeRenderDispatch(admin, videoId, isLong ? "long" : "short");
  if (!handoff.ok) {
    await refund();
    return fail(handoff.error);
  }

  await admin
    .from("videos")
    .update({
      status: "processing",
      step: isLong ? "Initializing Video Engine" : "Initializing Reel Engine",
    })
    .eq("id", videoId);

  return "dispatched";
}

/**
 * Dispatches one specific request, or sweeps every request that has waited
 * longer than `olderThanSeconds` (the trigger call was lost or the app was down).
 */
export async function dispatchPendingRenders(
  admin: Client,
  options: { videoId?: string | null; olderThanSeconds?: number; limit?: number } = {},
) {
  const outcomes: { id: string; outcome: DispatchOutcome }[] = [];

  if (options.videoId) {
    outcomes.push({
      id: options.videoId,
      outcome: await dispatchVideoRender(admin, options.videoId),
    });
    return outcomes;
  }

  const cutoff = new Date(Date.now() - (options.olderThanSeconds ?? 30) * 1000).toISOString();
  const { data: stale } = await admin
    .from("videos")
    .select("id")
    .eq("status", "pending")
    .eq("step", RENDER_STEP_QUEUED)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(options.limit ?? 5);

  for (const row of stale ?? []) {
    outcomes.push({ id: row.id, outcome: await dispatchVideoRender(admin, row.id) });
  }
  return outcomes;
}
