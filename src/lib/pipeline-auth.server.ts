/**
 * Authorization for every server-side pipeline route.
 *
 * The only accepted credential is the worker token that lives in the
 * `job_runner` table and is presented by the database itself (triggers and the
 * per-minute tick via `pipeline_dispatch`). Browser sessions are deliberately
 * not accepted: the client can never start, nudge or replay background work.
 */

export async function authorizePipelineRequest(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-worker-secret");
  if (!provided) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("verify_worker_token", { p_token: provided });
  return data === true;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Reads an optional JSON body without failing on empty or non-JSON payloads. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
