/**
 * Authenticated entry points for managing posts after they are published:
 * metadata edits, comment moderation and post stats. Tokens never leave the
 * server — the caller only passes their connection id and the post id.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Plain JSON the client can safely receive. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type ManageInput = {
  connectionId: string;
  postId: string;
  action:
    | "update_metadata"
    | "list_comments"
    | "reply_comment"
    | "hide_comment"
    | "unhide_comment"
    | "delete_comment"
    | "toggle_comments"
    | "stats"
    | "replies";
  /** Comment or reply id for moderation actions. */
  commentId?: string;
  /** Reply / caption / message text. */
  text?: string;
  /** New metadata for `update_metadata`. */
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
    privacyStatus?: "public" | "unlisted" | "private";
    caption?: string;
  };
  /** Target state for `toggle_comments`. */
  enabled?: boolean;
};

function validate(input: ManageInput): ManageInput {
  if (!input?.connectionId || !input?.postId || !input?.action) {
    throw new Error("A connected account, a post and an action are required.");
  }
  return input;
}

export const manageSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conn } = await supabase
      .from("social_connections")
      .select("provider, external_id, access_token")
      .eq("id", data.connectionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!conn?.access_token) throw new Error("This account needs to be reconnected.");
    const token = conn.access_token;
    const m = await import("@/lib/social-manage.server");

    const run = async (): Promise<Record<string, unknown>> => {
      switch (data.action) {
        case "update_metadata":
          if (conn.provider === "youtube") {
            return m.updateYouTubeVideo(token, data.postId, data.metadata ?? {});
          }
          if (conn.provider === "instagram") {
            return m.updateInstagramCaption(token, data.postId, data.metadata?.caption ?? "");
          }
          return m.updateFacebookPost(token, data.postId, data.metadata?.caption ?? "");
        case "list_comments":
          return { comments: await m.listComments(token, data.postId) };
        case "reply_comment":
          if (conn.provider === "threads") {
            return m.replyToThread(token, conn.external_id, data.postId, data.text ?? "");
          }
          return m.replyToComment(token, data.commentId ?? data.postId, data.text ?? "");
        case "hide_comment":
        case "unhide_comment": {
          const hide = data.action === "hide_comment";
          if (conn.provider === "threads") {
            return m.hideThreadsReply(token, data.commentId ?? data.postId, hide);
          }
          return m.hideComment(token, data.commentId ?? data.postId, hide);
        }
        case "delete_comment":
          return m.deleteComment(token, data.commentId ?? data.postId);
        case "toggle_comments":
          return m.setInstagramComments(token, data.postId, data.enabled !== false);
        case "stats":
          return { stats: await m.threadsInsights(token, data.postId) };
        case "replies":
          return { replies: await m.threadsReplies(token, data.postId) };
        default:
          throw new Error("Unsupported action.");
      }
    };

    return { ok: true, result: (await run()) as unknown as Json };
  });
