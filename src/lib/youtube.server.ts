/**
 * Server-only bridge to the `youtube-publish` Supabase Edge Function.
 *
 * That function owns the Google OAuth credentials and performs every YouTube
 * Data API v3 call. The app server only presents the backend worker token and
 * reads back a plain result — no Google key ever lives in app code.
 */

import { SUPABASE_URL } from "../../supabase/config/config";

const YOUTUBE_FUNCTION = `${SUPABASE_URL}/functions/v1/youtube-publish`;

async function workerToken(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("job_runner")
    .select("worker_token")
    .eq("id", "default")
    .maybeSingle();
  const token = (data?.worker_token ?? "").trim();
  if (!token) throw new Error("The backend worker credential is not configured yet.");
  return token;
}

/** Calls one action on the YouTube backend function. */
export async function callYouTube<T extends Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(YOUTUBE_FUNCTION, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-secret": await workerToken() },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body["ok"] !== true) {
    throw new Error(String(body["error"] ?? `The YouTube service refused the request (${res.status}).`));
  }
  return body as T;
}
