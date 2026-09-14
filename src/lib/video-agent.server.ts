/**
 * Server-only Video Agent helpers.
 *
 * Both the interactive Video Agent page and the workflow scheduler need the
 * exact same behaviour: reserve a render credit, create the pending `videos`
 * row and ask the external GitHub render pipeline to build it. It lives here so
 * neither path duplicates (or drifts from) the other.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GITHUB_DISPATCH_EVENT,
  GITHUB_DISPATCH_URL,
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
} from "../../supabase/config/config";
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
  aspect_ratio: string;
  quality: string;
  bitrate: string;
  duration_seconds: number;
};

type Client = SupabaseClient<Database>;

/** Captions are always white; the style string only carries the font size. */
function captionSizeToken(captionStyle: string): "small" | "medium" | "large" {
  const value = (captionStyle ?? "").toLowerCase();
  if (value.includes("large")) return "large";
  if (value.includes("medium")) return "medium";
  return "small";
}

/** Reserves a credit, inserts the pending row and dispatches the render. */
export async function createVideoRender(
  supabase: Client,
  userId: string,
  data: VideoRenderConfig,
): Promise<string> {
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
        videoCredits > 0 ? { video_credits: videoCredits } : { credits_used: sub.credits_used ?? 0 },
      )
      .eq("user_id", userId);
  };

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
        // GitHub allows 10 client_payload properties, so the captions flag also
        // carries the caption size: false | small | medium | large.
        captions: data.captions ? captionSizeToken(data.caption_style) : "false",
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

  return videoId;
}
