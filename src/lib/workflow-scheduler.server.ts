/**
 * Workflow scheduler (server-only).
 *
 * Woken by the database: "run now" requests, finished renders and the
 * per-minute tick all land here. For each due workflow it either creates a
 * video request (video actions) or publishes right away, then follows a render
 * it already started until it can publish. Publishing is verified per account:
 * only when every target confirms the post do we delete the generated video
 * from storage. A failed publish keeps the media and is retried on a later pass.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  computeSchedulePoints,
  normalizeCreationConfig,
  publishTo,
  storedAsset,
} from "@/lib/workflows.server";
import { isVideoAction } from "@/lib/social.shared";
import { createVideoRequest } from "@/lib/video-agent.server";
import { visualStylePrompt } from "@/lib/style-presets";

type Admin = SupabaseClient<Database>;

const MAX_WORKFLOWS = 5;
const MAX_PUBLISH_ATTEMPTS = 5;
const LOCK_SECONDS = 900;
/** A render that reports nothing for this long is treated as lost. */
const RENDER_TIMEOUT_MS = 45 * 60_000;

type WorkflowRow = {
  id: string;
  user_id: string;
  name: string;
  action_type: string;
  trigger_type: string;
  caption: string | null;
  hook_title: string | null;
  hashtags: string[] | null;
  media_url: string | null;
  media_path: string | null;
  targets: string[] | null;
  repeat_rule: string;
  time_slots: string[] | null;
  scheduled_at: string | null;
  tz_offset: number | null;
  creation_config: unknown;
  run_state: string | null;
  pending_video_id: string | null;
  publish_attempts: number | null;
  publish_at: string | null;
};

const SELECT =
  "id, user_id, name, action_type, trigger_type, caption, hook_title, hashtags, media_url, media_path, targets, repeat_rule, time_slots, scheduled_at, tz_offset, creation_config, run_state, pending_video_id, publish_attempts, publish_at";

export type SchedulerOutcome = { id: string; outcome: string };

async function loadDue(admin: Admin, nowIso: string, workflowId?: string | null) {
  let query = admin
    .from("workflows")
    .select(SELECT)
    .lte("next_due_at", nowIso)
    // Scheduled + enabled, or anything mid-run (requested / rendering / retry).
    .or("and(enabled.eq.true,trigger_type.eq.schedule),run_state.neq.idle")
    .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
    .order("next_due_at", { ascending: true })
    .limit(MAX_WORKFLOWS);
  if (workflowId) query = query.eq("id", workflowId);
  const { data } = await query;
  return (data ?? []) as unknown as WorkflowRow[];
}

async function processWorkflow(admin: Admin, raw: WorkflowRow, nowIso: string): Promise<string> {
  // Claim it so overlapping scheduler runs cannot double-post.
  const { data: claimed } = await admin
    .from("workflows")
    .update({ lock_until: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() })
    .eq("id", raw.id)
    .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();
  if (!claimed) return "busy";

  const creation = normalizeCreationConfig(raw.creation_config);
  const isVideo = isVideoAction(raw.action_type as Parameters<typeof isVideoAction>[0]);

  /** The exact moment this run must go out; null means "as soon as ready". */
  const publishAtMs = raw.publish_at ? new Date(raw.publish_at).getTime() : null;
  const slotReached = publishAtMs === null || Date.now() >= publishAtMs;

  /** Park the workflow until its publish slot without losing the finished video. */
  const waitForSlot = async (state: string) => {
    await admin
      .from("workflows")
      .update({ run_state: state, lock_until: null, next_due_at: raw.publish_at })
      .eq("id", raw.id);
  };

  const reschedule = async (extra: Record<string, unknown> = {}) => {
    const points =
      raw.trigger_type === "schedule"
        ? computeSchedulePoints({
            repeat_rule: raw.repeat_rule,
            time_slots: raw.time_slots,
            scheduled_at: raw.scheduled_at,
            tz_offset: raw.tz_offset ?? 0,
          })
        : { publishAt: null, wakeAt: null };
    await admin
      .from("workflows")
      .update({
        next_due_at: points.wakeAt,
        publish_at: points.publishAt,
        lock_until: null,
        run_state: "idle",
        pending_video_id: null,
        publish_attempts: 0,
        ...extra,
      })
      .eq("id", raw.id);
  };

  const log = async (status: string, detail: string) => {
    await admin.from("workflow_runs").insert({
      workflow_id: raw.id,
      user_id: raw.user_id,
      status,
      detail: detail.slice(0, 1000),
    });
    await admin
      .from("workflows")
      .update({ last_run_at: new Date().toISOString(), last_run_status: status })
      .eq("id", raw.id);
  };

  let mediaUrl = raw.media_url ?? "";
  let mediaPath = raw.media_path;
  let videoPrompt: string | undefined;

  try {
    // 0. Nothing to build: hold a plain post until its exact publish minute.
    if (!isVideo && !slotReached) {
      await waitForSlot("waiting");
      return "waiting-for-slot";
    }

    // 1. Video actions: make sure a finished render exists before publishing.
    if (isVideo) {
      let videoId = raw.pending_video_id;

      if (!videoId) {
        const promptBits = [raw.caption || raw.name, creation.category, creation.artStyle].filter(
          Boolean,
        );
        // Inserting the request is enough: the videos trigger dispatches the render.
        videoId = await createVideoRequest(admin, raw.user_id, {
          prompt: promptBits.join(". "),
          negative_prompt: [
            creation.instructions,
            "human, person, face, character, crowd, watermark, text",
          ]
            .filter(Boolean)
            .join(", "),
          voice_gender: creation.voiceGender.toLowerCase(),
          voice_persona: creation.voicePersona,
          voice_speed: 110,
          voice_pitch: 52,
          image_style: visualStylePrompt(creation.imageStyle, creation.artStyle),
          motion_template: "Auto Zoom-In",
          captions: creation.captions,
          caption_style: creation.captionStyle,
          caption_scale: creation.captionScale,
          aspect_ratio: creation.aspectRatio,
          quality: creation.quality,
          bitrate: "High",
          duration_seconds: creation.durationSeconds,
        });
        await admin
          .from("workflows")
          .update({ run_state: "rendering", pending_video_id: videoId, lock_until: null })
          .eq("id", raw.id);
        await log("processing", "Video render started");
        return "render-started";
      }

      const { data: video } = await admin
        .from("videos")
        .select("status, video_url, error, created_at, prompt")
        .eq("id", videoId)
        .maybeSingle();

      if (!video || video.status === "failed") {
        await log("failed", video?.error ?? "The render pipeline failed.");
        await reschedule();
        return "render-failed";
      }
      if (video.status !== "completed" || !video.video_url) {
        const age = Date.now() - new Date(video.created_at).getTime();
        if (age > RENDER_TIMEOUT_MS) {
          await admin
            .from("videos")
            .update({ status: "failed", error: "The render pipeline did not report back in time." })
            .eq("id", videoId);
          await log("failed", "The render pipeline did not report back in time.");
          await reschedule();
          return "render-timeout";
        }
        await admin.from("workflows").update({ lock_until: null }).eq("id", raw.id);
        return "rendering";
      }

      videoPrompt = video.prompt;

      // Rendered early: keep the finished video and wait for the exact slot.
      if (!slotReached) {
        await waitForSlot("ready");
        return "waiting-for-slot";
      }

      const stored = video.video_url;
      if (/^https?:\/\//i.test(stored)) {
        mediaUrl = stored;
        mediaPath = null;
      } else {
        const path = stored.replace(/^videos\//, "");
        const { data: signed } = await admin.storage
          .from("videos")
          .createSignedUrl(path, 60 * 60 * 6);
        mediaUrl = signed?.signedUrl ?? "";
        mediaPath = `videos/${path}`;
        if (!mediaUrl) throw new Error("Could not prepare the video for upload.");
      }
    } else if (raw.pending_video_id) {
      const { data: vid } = await admin
        .from("videos")
        .select("prompt")
        .eq("id", raw.pending_video_id)
        .maybeSingle();
      videoPrompt = vid?.prompt;
    }

    // 2. Publish to every selected account and read each platform's answer.
    const { data: targets } = await admin
      .from("social_connections")
      .select("id, provider, external_id, display_name, access_token, metadata")
      .eq("user_id", raw.user_id)
      .in("id", raw.targets ?? []);

    // Try dynamic title generation if available, otherwise fall back to story-aware templates
    let generatedTitles = null;
    try {
      const { generatePlatformTitles } = await import("@/lib/title-generator.server");
      generatedTitles = await generatePlatformTitles({
        script: videoPrompt || raw.caption || creation.instructions || raw.name,
        caption: raw.caption,
        name: raw.name,
        category: creation.category,
      });
    } catch {
      // Graceful fallback to deterministic builder
    }

    // Each platform builds its own sanitized, context-aware title/caption from this source.
    const contentSource = {
      hookTitle: raw.hook_title,
      hashtags: raw.hashtags,
      caption: raw.caption || creation.instructions,
      name: raw.name,
      category: creation.category,
      script: videoPrompt || raw.caption || creation.instructions || raw.name,
      story: videoPrompt || raw.caption || creation.instructions,
      prompt: videoPrompt ?? null,
      instructions: creation.instructions,
      ...(generatedTitles ? { generatedTitles } : {}),
    };

    const results: { account: string; ok: boolean; detail: string }[] = [];
    for (const target of (targets ?? []) as unknown as Parameters<typeof publishTo>[0][]) {
      try {
        const postId = await publishTo(
          target,
          (isVideo && raw.action_type === "publish_post"
            ? "publish_reel"
            : raw.action_type) as Parameters<typeof publishTo>[1],
          contentSource,
          mediaUrl,
        );
        results.push({
          account: target.display_name ?? target.provider,
          ok: true,
          detail: `Published (${postId})`,
        });
      } catch (err) {
        results.push({
          account: target.display_name ?? target.provider,
          ok: false,
          detail: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const allOk = results.length > 0 && results.every((r) => r.ok);
    const detail = results.map((r) => `${r.account}: ${r.detail}`).join(" · ") || "No accounts";

    if (!allOk) {
      // 3a. Publishing reported failure: keep the media and try again.
      const attempts = (raw.publish_attempts ?? 0) + 1;
      await log("failed", detail);
      if (attempts >= MAX_PUBLISH_ATTEMPTS || results.length === 0) {
        await reschedule();
      } else {
        await admin
          .from("workflows")
          .update({
            publish_attempts: attempts,
            run_state: "retry",
            lock_until: null,
            media_url: mediaUrl || null,
            media_path: mediaPath,
            next_due_at: new Date(Date.now() + 3 * 60_000).toISOString(),
          })
          .eq("id", raw.id);
      }
      return `publish-failed(${attempts})`;
    }

    // 3b. Every platform confirmed: drop the generated video and its record.
    let cleanup = "";
    const asset = storedAsset(mediaPath, mediaUrl);
    if (asset) {
      try {
        await admin.storage.from(asset.bucket).remove([asset.path]);
        await admin
          .from("generations")
          .delete()
          .eq("user_id", raw.user_id)
          .eq("storage_path", asset.path);
        if (raw.pending_video_id) {
          await admin.from("videos").delete().eq("id", raw.pending_video_id);
        }
        cleanup = " · generated video removed from storage";
      } catch (err) {
        console.error(`[scheduler ${raw.id}] cleanup failed`, err);
      }
    }

    await log("completed", detail + cleanup);
    await reschedule({ media_url: null, media_path: null });
    return "published";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[scheduler ${raw.id}]`, message);
    await log("failed", message);
    await reschedule();
    return "error";
  }
}

/**
 * One scheduler pass. When `workflowId` is given (a "run now" wake-up) that
 * workflow is handled first, then any other due work is picked up as usual.
 */
export async function runSchedulerPass(
  admin: Admin,
  options: { workflowId?: string | null } = {},
): Promise<SchedulerOutcome[]> {
  const nowIso = new Date().toISOString();
  const handled: SchedulerOutcome[] = [];
  const seen = new Set<string>();

  const batches = options.workflowId
    ? [await loadDue(admin, nowIso, options.workflowId), await loadDue(admin, nowIso)]
    : [await loadDue(admin, nowIso)];

  for (const batch of batches) {
    for (const raw of batch) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      handled.push({ id: raw.id, outcome: await processWorkflow(admin, raw, nowIso) });
    }
  }
  return handled;
}
