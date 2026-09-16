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
    const { data: payload, error: invokeErr } = await admin.functions.invoke<{
      ok?: boolean;
      error?: string;
    }>("video-agent", {
      body: { action: "dispatch", videoId },
      headers: { "x-worker-secret": workerSecret },
    });
    if (invokeErr || !payload || payload.ok !== true) {
      return {
        ok: false,
        error: payload?.error ?? invokeErr?.message ?? "The render service refused the job.",
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
    .select("monthly_quota, credits_used, video_credits")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sub) return null;
  const videoCredits = sub.video_credits ?? 0;
  const creditsUsed = sub.credits_used ?? 0;
  const remainingQuota = Math.max((sub.monthly_quota ?? 0) - creditsUsed, 0);
  return { videoCredits, creditsUsed, remainingQuota };
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
  if (credits.videoCredits <= 0 && credits.remainingQuota <= 0) {
    throw new Error("You are out of render credits. Upgrade your plan to keep creating videos.");
  }

  const { data: row, error } = await supabase
    .from("videos")
    .insert({ ...data, user_id: userId, status: "pending", step: RENDER_STEP_QUEUED, progress: 0 })
    .select("id")
    .single();

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

  // a. Credit reservation (video credits first, then the monthly quota).
  const credits = await readCredits(admin, userId);
  if (!credits) return fail("No active plan was found on your account.");
  if (credits.videoCredits <= 0 && credits.remainingQuota <= 0) {
    return fail("You are out of render credits. Upgrade your plan to keep creating videos.");
  }
  const spend =
    credits.videoCredits > 0
      ? { video_credits: credits.videoCredits - 1 }
      : { credits_used: credits.creditsUsed + 1 };
  const { error: spendError } = await admin
    .from("subscriptions")
    .update(spend)
    .eq("user_id", userId);
  if (spendError) return fail("Could not reserve a render credit. Please try again.");

  const refund = async () => {
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
  const handoff = await invokeRenderDispatch(admin, videoId);
  if (!handoff.ok) {
    await refund();
    return fail(handoff.error);
  }

  await admin
    .from("videos")
    .update({ status: "processing", step: "Initializing Video Engine" })
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
