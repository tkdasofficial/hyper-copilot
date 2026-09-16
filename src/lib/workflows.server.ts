/**
 * Server-only workflow helpers shared by the app's "run now" action and the
 * automatic scheduler: publishing to Meta, resolving stored media, and working
 * out when a schedule is next due.
 */

import {
  GRAPH_VERSION,
  type ActionType,
  type CreationConfig,
  type SocialProvider,
  defaultCreationConfig,
} from "@/lib/social.shared";
import { normalizeArtStyle, normalizeImageStyle } from "@/lib/style-presets";
import { buildPlatformContent, type ContentSource } from "@/lib/publish-content";

export { buildPlatformContent, buildPublishCaption, sanitizeText } from "@/lib/publish-content";
export type { ContentSource, ContentSource as CaptionSource } from "@/lib/publish-content";

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const THREADS_GRAPH = "https://graph.threads.net/v1.0";

export type Target = {
  id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  access_token: string | null;
  metadata: Record<string, unknown> | null;
};

async function postJson(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function getJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Meta ingests a video asynchronously: the container must report FINISHED
 * before media_publish will accept it. We poll instead of failing fast so a
 * fresh render publishes on the first pass.
 */
async function waitForContainer(base: string, containerId: string, token: string) {
  const deadline = Date.now() + 180_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const info = await getJson(
      `${base}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    const code = String(info["status_code"] ?? "");
    lastStatus = String(info["status"] ?? code);
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`The platform rejected the media: ${lastStatus || code}`);
    }
    await sleep(6000);
  }
  throw new Error(`The platform is still processing the video (${lastStatus || "IN_PROGRESS"}).`);
}

/** YouTube category used for every upload (20 = Gaming). */
export const YOUTUBE_CATEGORY_ID = "20";

export type PublishOptions = {
  /** Public image URL used as the Instagram Reels cover frame. */
  coverUrl?: string | null;
  /** ISO timestamp for scheduled publishing where the platform supports it. */
  scheduledPublishAt?: string | null;
};

/**
 * Publishes to one account and returns the platform's post id. The id is the
 * proof-of-publish the cleanup step waits for: without it we never delete the
 * generated media.
 *
 * The caller passes the raw content source; each platform gets its own
 * sanitized title/description/caption + hashtag split (see publish-content).
 */
export async function publishTo(
  target: Target,
  action: ActionType,
  source: ContentSource | string,
  mediaUrl: string,
  options: PublishOptions = {},
): Promise<string> {
  const token = target.access_token;
  if (!token) throw new Error("This account needs to be reconnected.");
  const isVideo = action === "publish_reel" || action === "crosspost";
  const contentSource: ContentSource =
    typeof source === "string" ? { caption: source } : source;
  const content = buildPlatformContent(target.provider as SocialProvider, contentSource);

  const scheduledAt = options.scheduledPublishAt
    ? Math.floor(new Date(options.scheduledPublishAt).getTime() / 1000)
    : 0;
  const isScheduled = scheduledAt > Math.floor(Date.now() / 1000) + 600;

  const idOf = (res: Record<string, unknown>) => {
    const id = res["id"] ?? res["post_id"] ?? res["video_id"];
    if (!id) throw new Error("The platform did not confirm the post.");
    return String(id);
  };

  if (target.provider === "youtube") {
    if (!mediaUrl) throw new Error("YouTube needs a video file to upload.");
    const { callYouTube } = await import("@/lib/youtube.server");
    const out = await callYouTube<{ videoId: string }>("upload", {
      refreshToken: token,
      videoUrl: mediaUrl,
      title: content.title,
      description: content.description,
      tags: content.tags,
      categoryId: YOUTUBE_CATEGORY_ID,
      privacyStatus: "public",
      madeForKids: false,
      isShort: isVideo,
      ...(isScheduled ? { publishAt: options.scheduledPublishAt } : {}),
    });
    return out.videoId;
  }

  if (target.provider === "facebook_page") {
    if (isVideo) {
      if (!mediaUrl) throw new Error("A video URL is required for a reel.");
      return idOf(
        await postJson(`${GRAPH}/${target.external_id}/videos`, {
          file_url: mediaUrl,
          title: content.title,
          description: content.caption,
          access_token: token,
          ...(isScheduled
            ? { published: "false", scheduled_publish_time: String(scheduledAt) }
            : {}),
        }),
      );
    }
    if (mediaUrl) {
      return idOf(
        await postJson(`${GRAPH}/${target.external_id}/photos`, {
          url: mediaUrl,
          caption: content.caption,
          access_token: token,
          ...(isScheduled
            ? { published: "false", scheduled_publish_time: String(scheduledAt) }
            : {}),
        }),
      );
    }
    return idOf(
      await postJson(`${GRAPH}/${target.external_id}/feed`, {
        message: content.caption,
        access_token: token,
        ...(isScheduled
          ? { published: "false", scheduled_publish_time: String(scheduledAt) }
          : {}),
      }),
    );
  }

  if (target.provider === "instagram") {
    if (!mediaUrl) throw new Error("Instagram needs an image or video URL.");
    const container = await postJson(`${GRAPH}/${target.external_id}/media`, {
      ...(isVideo
        ? {
            media_type: "REELS",
            video_url: mediaUrl,
            // Reels also land on the main grid for maximum distribution.
            share_to_feed: "true",
            ...(options.coverUrl ? { cover_url: options.coverUrl } : {}),
          }
        : { image_url: mediaUrl }),
      caption: content.caption,
      access_token: token,
    });
    const containerId = String(container["id"]);
    await waitForContainer(GRAPH, containerId, token);
    return idOf(
      await postJson(`${GRAPH}/${target.external_id}/media_publish`, {
        creation_id: containerId,
        access_token: token,
      }),
    );
  }

  // Threads: <=500 characters, single video, replies open to everyone.
  const container = await postJson(`${THREADS_GRAPH}/${target.external_id}/threads`, {
    media_type: mediaUrl ? (isVideo ? "VIDEO" : "IMAGE") : "TEXT",
    ...(mediaUrl ? (isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }) : {}),
    text: content.caption.slice(0, 500),
    reply_control: "everyone",
    access_token: token,
  });
  if (mediaUrl) await waitForContainer(THREADS_GRAPH, String(container["id"]), token);
  return idOf(
    await postJson(`${THREADS_GRAPH}/${target.external_id}/threads_publish`, {
      creation_id: String(container["id"]),
      access_token: token,
    }),
  );
}

/**
 * Resolves a stored Supabase asset from an explicit "bucket/path" reference or
 * from a Storage URL. Returns null for third-party links we must not touch.
 */
export function storedAsset(
  mediaPath: string | null,
  mediaUrl: string | null,
): { bucket: string; path: string } | null {
  const fromRef = (ref: string) => {
    const clean = ref.replace(/^\/+/, "");
    const slash = clean.indexOf("/");
    if (slash <= 0) return null;
    return { bucket: clean.slice(0, slash), path: clean.slice(slash + 1) };
  };

  if (mediaPath?.trim()) return fromRef(mediaPath.trim());
  if (!mediaUrl) return null;
  const match = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/(.+)$/.exec(mediaUrl);
  if (!match?.[1]) return null;
  return fromRef(decodeURIComponent(match[1].split("?")[0] ?? ""));
}

/** Fills any missing creation setting with its default. */
export function normalizeCreationConfig(raw: unknown): CreationConfig {
  const base = defaultCreationConfig();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Record<string, unknown>;
  const str = (key: keyof CreationConfig, fallback: string) =>
    typeof value[key] === "string" && value[key] ? String(value[key]) : fallback;
  const duration = Number(value["durationSeconds"]);
  const scale = Number(value["captionScale"]);
  return {
    instructions: str("instructions", base.instructions),
    category: str("category", base.category),
    artStyle: normalizeArtStyle(value["artStyle"]),
    imageStyle: normalizeImageStyle(value["imageStyle"]),
    aspectRatio: str("aspectRatio", base.aspectRatio),
    durationSeconds: Number.isFinite(duration)
      ? Math.min(60, Math.max(5, Math.round(duration)))
      : base.durationSeconds,
    voiceGender: str("voiceGender", base.voiceGender),
    voicePersona: str("voicePersona", base.voicePersona),
    voiceTone: str("voiceTone", base.voiceTone),
    captions: typeof value["captions"] === "boolean" ? value["captions"] : base.captions,
    captionStyle: str("captionStyle", base.captionStyle),
    captionScale: Number.isFinite(scale)
      ? Math.min(10, Math.max(1, Math.round(scale)))
      : base.captionScale,
    quality: str("quality", base.quality),
  };
}

export type ScheduleShape = {
  repeat_rule: string;
  time_slots: string[] | null;
  scheduled_at: string | null;
  tz_offset: number;
};

/**
 * Next UTC instant this schedule should fire, or null when it is finished.
 *
 * Time slots are wall-clock times in the creator's own timezone, stored as an
 * offset in minutes so the same 9:00 AM keeps firing at 9:00 AM for them.
 */
export function computeNextDueAt(schedule: ScheduleShape, from: Date = new Date()): string | null {
  const offsetMs = (schedule.tz_offset ?? 0) * 60_000;
  const slots = (schedule.time_slots ?? [])
    .filter((slot) => /^([01]\d|2[0-3]):[0-5]\d$/.test(slot))
    .sort();

  if (schedule.repeat_rule === "once") {
    if (!schedule.scheduled_at) return null;
    const at = new Date(schedule.scheduled_at);
    if (slots[0]) {
      const local = new Date(at.getTime() + offsetMs);
      const [h = 0, m = 0] = slots[0].split(":").map(Number);
      local.setUTCHours(h, m, 0, 0);
      at.setTime(local.getTime() - offsetMs);
    }
    return at.getTime() > from.getTime() ? at.toISOString() : null;
  }
  if (slots.length === 0) return null;

  const startsAt = schedule.scheduled_at ? new Date(schedule.scheduled_at) : null;
  const searchFrom = startsAt && startsAt.getTime() > from.getTime() ? startsAt : from;
  const stepDays = schedule.repeat_rule === "weekly" ? 7 : 1;
  // Anchor weekly repeats to the weekday of the start date.
  const local = new Date(searchFrom.getTime() + offsetMs);

  for (let day = 0; day <= 370; day += 1) {
    const dayStart = new Date(local);
    dayStart.setUTCDate(dayStart.getUTCDate() + day);
    if (stepDays === 7 && startsAt) {
      const anchor = new Date(startsAt.getTime() + offsetMs).getUTCDay();
      if (dayStart.getUTCDay() !== anchor) continue;
    }
    for (const slot of slots) {
      const [h = 0, m = 0] = slot.split(":").map(Number);
      const candidateLocal = new Date(dayStart);
      candidateLocal.setUTCHours(h, m, 0, 0);
      const candidateUtc = new Date(candidateLocal.getTime() - offsetMs);
      if (candidateUtc.getTime() > from.getTime()) return candidateUtc.toISOString();
    }
  }
  return null;
}

/**
 * How long before the chosen publish time the pipeline starts creating the
 * video, so the finished file is already stored when the slot arrives.
 */
export const PRERENDER_LEAD_MS = 5 * 60_000;

/**
 * Turns a schedule into the two timestamps the runner needs:
 * `publishAt` (the exact moment the post must go out) and `wakeAt`
 * (5 minutes earlier, when creation starts). A slot that is already less
 * than 5 minutes away wakes immediately and publishes as soon as it can.
 */
export function computeSchedulePoints(
  schedule: ScheduleShape,
  from: Date = new Date(),
): { publishAt: string | null; wakeAt: string | null } {
  const publishAt = computeNextDueAt(schedule, from);
  if (!publishAt) return { publishAt: null, wakeAt: null };
  const wakeMs = Math.max(from.getTime(), new Date(publishAt).getTime() - PRERENDER_LEAD_MS);
  return { publishAt, wakeAt: new Date(wakeMs).toISOString() };
}

