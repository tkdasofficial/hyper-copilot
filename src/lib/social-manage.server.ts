/**
 * Server-only post-publish management for every connected platform:
 * metadata updates, comment moderation, replies and post stats.
 *
 * Nothing here runs in the browser — access tokens stay on the server and the
 * app only ever sees the plain result of a call.
 */

import { GRAPH_VERSION } from "@/lib/social.shared";

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const THREADS_GRAPH = "https://graph.threads.net/v1.0";

async function call(
  url: string,
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(body).toString(),
        }
      : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/* ------------------------------ YouTube ------------------------------ */

export type YouTubeMetadata = {
  title?: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "unlisted" | "private";
  categoryId?: string;
};

/** Updates title / description / tags / privacy on an uploaded video. */
export async function updateYouTubeVideo(
  refreshToken: string,
  videoId: string,
  metadata: YouTubeMetadata,
) {
  const { callYouTube } = await import("@/lib/youtube.server");
  return callYouTube<{ videoId: string }>("update", { refreshToken, videoId, ...metadata });
}

/* ---------------------------- Instagram ------------------------------ */

/** Rewrites the caption of a published Instagram post. */
export function updateInstagramCaption(token: string, mediaId: string, caption: string) {
  return call(`${GRAPH}/${mediaId}`, "POST", { caption, access_token: token });
}

/** Turns commenting on or off for a published Instagram post. */
export function setInstagramComments(token: string, mediaId: string, enabled: boolean) {
  return call(`${GRAPH}/${mediaId}`, "POST", {
    comment_enabled: enabled ? "true" : "false",
    access_token: token,
  });
}

/* ----------------------------- Facebook ------------------------------ */

/** Updates the message of a published Page post. */
export function updateFacebookPost(token: string, postId: string, message: string) {
  return call(`${GRAPH}/${postId}`, "POST", { message, access_token: token });
}

/** Reads the most recent comments on a post (newest first). */
export async function listComments(token: string, postId: string, limit = 25) {
  const res = await call(
    `${GRAPH}/${postId}/comments?order=reverse_chronological&limit=${limit}` +
      `&fields=id,message,from,created_time,like_count&access_token=${encodeURIComponent(token)}`,
    "GET",
  );
  return (res["data"] ?? []) as Record<string, unknown>[];
}

/** Posts an automated reply under a comment. */
export function replyToComment(token: string, commentId: string, message: string) {
  return call(`${GRAPH}/${commentId}/comments`, "POST", { message, access_token: token });
}

/** Hides (or un-hides) a comment without deleting it. */
export function hideComment(token: string, commentId: string, hidden = true) {
  return call(`${GRAPH}/${commentId}`, "POST", {
    is_hidden: hidden ? "true" : "false",
    access_token: token,
  });
}

/** Permanently deletes a comment. */
export function deleteComment(token: string, commentId: string) {
  return call(`${GRAPH}/${commentId}?access_token=${encodeURIComponent(token)}`, "DELETE");
}

/* ------------------------------ Threads ------------------------------ */

/** Post-level stats (views, likes, replies, reposts, quotes). */
export async function threadsInsights(token: string, postId: string) {
  const metrics = "views,likes,replies,reposts,quotes";
  const res = await call(
    `${THREADS_GRAPH}/${postId}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`,
    "GET",
  );
  return (res["data"] ?? []) as Record<string, unknown>[];
}

/** Reads the reply thread under a Threads post. */
export async function threadsReplies(token: string, postId: string) {
  const res = await call(
    `${THREADS_GRAPH}/${postId}/replies?fields=id,text,username,timestamp,hide_status` +
      `&access_token=${encodeURIComponent(token)}`,
    "GET",
  );
  return (res["data"] ?? []) as Record<string, unknown>[];
}

/** Publishes a reply to a Threads post. */
export async function replyToThread(token: string, userId: string, postId: string, text: string) {
  const container = await call(`${THREADS_GRAPH}/${userId}/threads`, "POST", {
    media_type: "TEXT",
    text: text.slice(0, 500),
    reply_to_id: postId,
    reply_control: "everyone",
    access_token: token,
  });
  return call(`${THREADS_GRAPH}/${userId}/threads_publish`, "POST", {
    creation_id: String(container["id"]),
    access_token: token,
  });
}

/** Hides or shows a single reply on Threads. */
export function hideThreadsReply(token: string, replyId: string, hide = true) {
  return call(`${THREADS_GRAPH}/${replyId}/manage_reply`, "POST", {
    hide: hide ? "true" : "false",
    access_token: token,
  });
}
