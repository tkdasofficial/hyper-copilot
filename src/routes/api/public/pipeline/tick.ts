/**
 * Per-minute pipeline tick (safety net).
 *
 * pg_cron calls this once a minute — and only when something is actually due.
 * It re-runs every stage in order so work always completes even if a trigger
 * call was lost or the app was unavailable when it fired:
 *
 *   1. render requests that nobody dispatched
 *   2. due / retrying / render-complete workflows (time-based posts live here)
 *   3. queued background tasks
 */

import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { authorizePipelineRequest, json } = await import("@/lib/pipeline-auth.server");
  if (!(await authorizePipelineRequest(request))) return json({ error: "Unauthorized" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { invokeEdgeFunction } = await import("@/lib/edge-functions.server");
  const { dispatchPendingRenders } = await import("@/lib/video-agent.server");
  const { runSchedulerPass } = await import("@/lib/workflow-scheduler.server");
  const { runWorkerPass } = await import("@/lib/jobs-worker.server");

  // Trigger edge functions asynchronously for full pipeline execution
  void invokeEdgeFunction("process-scheduled-cron");
  void invokeEdgeFunction("handle-job-execution");

  const renders = await dispatchPendingRenders(supabaseAdmin, { olderThanSeconds: 30 });
  const workflows = await runSchedulerPass(supabaseAdmin);
  const jobs = await runWorkerPass(supabaseAdmin, { budgetMs: 45_000 });

  return json({ ok: true, renders, workflows, jobs });
}

export const Route = createFileRoute("/api/public/pipeline/tick")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
