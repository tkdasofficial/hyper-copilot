/**
 * Workflow scheduler.
 *
 * Called every few minutes by pg_cron. For each due workflow it either starts a
 * video render (video actions) or publishes right away, then follows a render it
 * already started until it can publish. Publishing is verified per account: only
 * when every target confirms the post do we delete the generated video from
 * storage. A failed publish keeps the media and is retried on the next pass.
 */

import { createFileRoute } from "@tanstack/react-router";

const MAX_WORKFLOWS = 5;
const MAX_PUBLISH_ATTEMPTS = 5;
const LOCK_SECONDS = 900;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function authorize(request: Request) {
  const provided = request.headers.get("x-worker-secret");
  if (!provided) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("verify_worker_token", { p_token: provided });
  return data === true;
}

type WorkflowRow = {
  id: string;
  user_id: string;
  name: string;
  action_type: string;
  trigger_type: string;
  caption: string | null;
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
};

const SELECT =
  "id, user_id, name, action_type, trigger_type, caption, media_url, media_path, targets, repeat_rule, time_slots, scheduled_at, tz_offset, creation_config, run_state, pending_video_id, publish_attempts";

async function handle(request: Request) {
  if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { publishTo, storedAsset, computeNextDueAt, normalizeCreationConfig } = await import(
    "@/lib/workflows.server"
  );
  const { isVideoAction } = await import("@/lib/social.shared");
  const { createVideoRender } = await import("@/lib/video-agent.server");

  const nowIso = new Date().toISOString();

  const { data: due } = await supabaseAdmin
    .from("workflows")
    .select(SELECT)
    .eq("enabled", true)
    .lte("next_due_at", nowIso)
    .or("trigger_type.eq.schedule,run_state.neq.idle")
    .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
    .order("next_due_at", { ascending: true })
    .limit(MAX_WORKFLOWS);

  const handled: { id: string; outcome: string }[] = [];

  for (const raw of (due ?? []) as unknown as WorkflowRow[]) {
    // Claim it so overlapping scheduler runs cannot double-post.
    const { data: claimed } = await supabaseAdmin
      .from("workflows")
      .update({ lock_until: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() })
      .eq("id", raw.id)
      .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const creation = normalizeCreationConfig(raw.creation_config);
    const isVideo = isVideoAction(raw.action_type as Parameters<typeof isVideoAction>[0]);
    const reschedule = async (extra: Record<string, unknown> = {}) => {
      const nextDueAt = raw.trigger_type === "schedule"
        ? computeNextDueAt({
            repeat_rule: raw.repeat_rule,
            time_slots: raw.time_slots,
            scheduled_at: raw.scheduled_at,
            tz_offset: raw.tz_offset ?? 0,
          })
        : null;
      await supabaseAdmin
        .from("workflows")
        .update({
          next_due_at: nextDueAt,
          lock_until: null,
          run_state: "idle",
          pending_video_id: null,
          publish_attempts: 0,
          ...extra,
        })
        .eq("id", raw.id);
    };
    const log = async (status: string, detail: string) => {
      await supabaseAdmin.from("workflow_runs").insert({
        workflow_id: raw.id,
        user_id: raw.user_id,
        status,
        detail: detail.slice(0, 1000),
      });
      await supabaseAdmin
        .from("workflows")
        .update({ last_run_at: new Date().toISOString(), last_run_status: status })
        .eq("id", raw.id);
    };

    let mediaUrl = raw.media_url ?? "";
    let mediaPath = raw.media_path;

    try {
      // 1. Video actions: make sure a finished render exists before publishing.
      if (isVideo) {
        let videoId = raw.pending_video_id;

        if (!videoId) {
          const promptBits = [
            raw.caption || raw.name,
            creation.category,
            creation.artStyle,
          ].filter(Boolean);
          videoId = await createVideoRender(supabaseAdmin, raw.user_id, {
            prompt: promptBits.join(". "),
            negative_prompt: [
              creation.instructions,
              "human, person, face, character, crowd, watermark, text",
            ].filter(Boolean).join(", "),
            voice_gender: creation.voiceGender.toLowerCase(),
            voice_persona: creation.voicePersona,
            voice_speed: 110,
            voice_pitch: 52,
            image_style: `${creation.imageStyle} · ${creation.artStyle}`,
            motion_template: "Auto Zoom-In",
            captions: creation.captions,
            caption_style: creation.captionStyle,
            aspect_ratio: creation.aspectRatio,
            quality: creation.quality,
            bitrate: "High",
            duration_seconds: creation.durationSeconds,
          });
          await supabaseAdmin
            .from("workflows")
            .update({ run_state: "rendering", pending_video_id: videoId, lock_until: null })
            .eq("id", raw.id);
          await log("processing", "Video render started");
          handled.push({ id: raw.id, outcome: "render-started" });
          continue;
        }

        const { data: video } = await supabaseAdmin
          .from("videos")
          .select("status, video_url, error")
          .eq("id", videoId)
          .maybeSingle();

        if (!video || video.status === "failed") {
          await log("failed", video?.error ?? "The render pipeline failed.");
          await reschedule();
          handled.push({ id: raw.id, outcome: "render-failed" });
          continue;
        }
        if (video.status !== "completed" || !video.video_url) {
          await supabaseAdmin.from("workflows").update({ lock_until: null }).eq("id", raw.id);
          handled.push({ id: raw.id, outcome: "rendering" });
          continue;
        }

        const stored = video.video_url;
        if (/^https?:\/\//i.test(stored)) {
          mediaUrl = stored;
          mediaPath = null;
        } else {
          const path = stored.replace(/^videos\//, "");
          const { data: signed } = await supabaseAdmin.storage
            .from("videos")
            .createSignedUrl(path, 60 * 60 * 6);
          mediaUrl = signed?.signedUrl ?? "";
          mediaPath = `videos/${path}`;
          if (!mediaUrl) throw new Error("Could not prepare the video for upload.");
        }
      }

      // 2. Publish to every selected account and read each platform's answer.
      const { data: targets } = await supabaseAdmin
        .from("social_connections")
        .select("id, provider, external_id, display_name, access_token, metadata")
        .eq("user_id", raw.user_id)
        .in("id", raw.targets ?? []);

      const results: { account: string; ok: boolean; detail: string }[] = [];
      for (const target of (targets ?? []) as unknown as Parameters<typeof publishTo>[0][]) {
        try {
          const postId = await publishTo(
            target,
            (isVideo && raw.action_type === "publish_post"
              ? "publish_reel"
              : raw.action_type) as Parameters<typeof publishTo>[1],
            raw.caption ?? creation.instructions ?? "",
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
        if (attempts >= MAX_PUBLISH_ATTEMPTS) {
          await reschedule();
        } else {
          await supabaseAdmin
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
        handled.push({ id: raw.id, outcome: `publish-failed(${attempts})` });
        continue;
      }

      // 3b. Every platform confirmed: drop the generated video and its record.
      let cleanup = "";
      const asset = storedAsset(mediaPath, mediaUrl);
      if (asset) {
        try {
          await supabaseAdmin.storage.from(asset.bucket).remove([asset.path]);
          await supabaseAdmin
            .from("generations")
            .delete()
            .eq("user_id", raw.user_id)
            .eq("storage_path", asset.path);
          if (raw.pending_video_id) {
            await supabaseAdmin.from("videos").delete().eq("id", raw.pending_video_id);
          }
          cleanup = " · generated video removed from storage";
        } catch (err) {
          console.error(`[scheduler ${raw.id}] cleanup failed`, err);
        }
      }

      await log("completed", detail + cleanup);
      await reschedule({ media_url: null, media_path: null });
      handled.push({ id: raw.id, outcome: "published" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[scheduler ${raw.id}]`, message);
      await log("failed", message);
      await reschedule();
      handled.push({ id: raw.id, outcome: "error" });
    }
  }

  return json({ ok: true, handled });
}

export const Route = createFileRoute("/api/public/workflows/scheduler")({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) } },
});
