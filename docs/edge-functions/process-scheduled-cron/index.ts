import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type ActionType = "publish_post" | "publish_reel" | "crosspost";

type Target = {
  id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  access_token: string | null;
  metadata?: Record<string, unknown> | null;
};

type ScheduleExecutionReport = {
  workflowId: string;
  name: string;
  action: string;
  outcome: "rendered" | "published" | "pending_render" | "failed" | "skipped";
  detail?: string;
};

/**
 * Standardized Enterprise Scheduled Workflow Processor
 * Inspects due workflows across the platform, dispatches rendering or social publication,
 * advances recurrence rules, and records audit state.
 */
export async function processScheduledWorkflows(options?: {
  workflowId?: string;
  force?: boolean;
}): Promise<{ processedCount: number; reports: ScheduleExecutionReport[] }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase credentials in Edge Function environment.");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  const reports: ScheduleExecutionReport[] = [];

  // Query due workflows
  let query = supabase
    .from("workflows")
    .select(
      "id, user_id, name, action_type, trigger_type, caption, hook_title, hashtags, media_url, media_path, targets, repeat_rule, time_slots, scheduled_at, tz_offset, creation_config, run_state, pending_video_id, publish_attempts, lock_until",
    );

  if (options?.workflowId) {
    query = query.eq("id", options.workflowId);
  } else {
    query = query
      .or(`next_due_at.lte.${now.toISOString()},run_state.eq.requested`)
      .or(`lock_until.is.null,lock_until.lte.${now.toISOString()}`)
      .limit(10);
  }

  const { data: workflows, error: fetchErr } = await query;
  if (fetchErr) {
    throw new Error(`Failed to query due workflows: ${fetchErr.message}`);
  }

  for (const wf of workflows ?? []) {
    // 1. Lock workflow row
    const lockUntil = new Date(Date.now() + 15 * 60_000).toISOString();
    await supabase
      .from("workflows")
      .update({ lock_until: lockUntil, run_state: "processing" })
      .eq("id", wf.id);

    try {
      // Check if video is required and not yet ready
      const isVideo = wf.action_type === "publish_reel" || wf.action_type === "crosspost";

      if (isVideo && !wf.media_url && !wf.media_path) {
        // If pending_video_id exists, check its status
        if (wf.pending_video_id) {
          const { data: video } = await supabase
            .from("videos")
            .select("status, video_url")
            .eq("id", wf.pending_video_id)
            .maybeSingle();

          if (video?.status === "completed" && video.video_url) {
            wf.media_url = video.video_url;
          } else if (video?.status === "failed") {
            reports.push({
              workflowId: wf.id,
              name: wf.name,
              action: wf.action_type,
              outcome: "failed",
              detail: "Associated video rendering failed.",
            });
            await supabase
              .from("workflows")
              .update({ run_state: "failed", lock_until: null })
              .eq("id", wf.id);
            continue;
          } else {
            reports.push({
              workflowId: wf.id,
              name: wf.name,
              action: wf.action_type,
              outcome: "pending_render",
              detail: "Video rendering still in progress.",
            });
            await supabase
              .from("workflows")
              .update({ run_state: "rendering", lock_until: null })
              .eq("id", wf.id);
            continue;
          }
        }
      }

      // 2. Delegate social publishing to publish-to-meta
      const publishRes = await fetch(`${supabaseUrl}/functions/v1/publish-to-meta`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ workflow_id: wf.id }),
      });

      const publishJson = await publishRes.json();
      if (!publishRes.ok || !publishJson.ok) {
        throw new Error(publishJson.error || "Meta publishing failed.");
      }

      // 3. Mark complete & schedule next recurrence
      const attempts = (wf.publish_attempts ?? 0) + 1;
      await supabase
        .from("workflows")
        .update({
          run_state: "completed",
          publish_attempts: attempts,
          lock_until: null,
        })
        .eq("id", wf.id);

      reports.push({
        workflowId: wf.id,
        name: wf.name,
        action: wf.action_type,
        outcome: "published",
        detail: `Successfully published to ${publishJson.count ?? 0} social accounts.`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("workflows")
        .update({
          run_state: "failed",
          lock_until: null,
          publish_attempts: (wf.publish_attempts ?? 0) + 1,
        })
        .eq("id", wf.id);

      reports.push({
        workflowId: wf.id,
        name: wf.name,
        action: wf.action_type,
        outcome: "failed",
        detail: errMsg,
      });
    }
  }

  return { processedCount: reports.length, reports };
}


// --- Backend-only access guard (added by Lovable) ---
async function assertBackendCaller(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const token = (req.headers.get("x-worker-secret") ?? url.searchParams.get("worker_secret") ?? "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  if (serviceKey && auth && auth === serviceKey) return null;

  if (token) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (supabaseUrl && serviceKey) {
      try {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data } = await admin.rpc("verify_worker_token", { p_token: token });
        if (data === true) return null;
      } catch (_e) {
        // fall through to reject
      }
    }
  }

  return new Response(JSON.stringify({ error: "Forbidden: backend-only endpoint." }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
// --- end guard ---

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __denied = await assertBackendCaller(req);
  if (__denied) return __denied;

  try {
    let workflowId: string | undefined;
    let force: boolean | undefined;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        workflowId = body.workflowId || body.workflow_id;
        force = Boolean(body.force);
      } catch {
        // empty body is allowable for cron invokes
      }
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      workflowId = url.searchParams.get("workflowId") || url.searchParams.get("workflow_id") || undefined;
      force = url.searchParams.get("force") === "true";
    }

    const result = await processScheduledWorkflows({ workflowId, force });

    return new Response(
      JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        ...result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
