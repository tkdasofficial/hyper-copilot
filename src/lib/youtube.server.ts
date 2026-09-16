/**
 * Server-only bridge to the `youtube-publish` Supabase Edge Function.
 *
 * That function owns the Google OAuth credentials and performs every YouTube
 * Data API v3 call. The app server only presents the backend worker token and
 * reads back a plain result — no Google key ever lives in app code.
 */

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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const secret = await workerToken();
  const { data, error } = await supabaseAdmin.functions.invoke<T>("youtube-publish", {
    body: { action, ...payload },
    headers: { "x-worker-secret": secret },
  });
  if (error || !data || (data as Record<string, unknown>)["ok"] !== true) {
    const errorMsg =
      (data as Record<string, unknown> | null)?.["error"] ??
      error?.message ??
      "The YouTube service refused the request.";
    throw new Error(String(errorMsg));
  }
  return data;
}
