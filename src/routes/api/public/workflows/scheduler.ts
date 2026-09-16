/**
 * Workflow scheduler endpoint.
 *
 * Called only by the database: "run now" requests (`workflows_dispatch_scheduler`
 * trigger), finished renders (`videos_dispatch_pipeline` trigger) and the
 * per-minute pipeline tick. The browser never calls this route.
 */

import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { authorizePipelineRequest, json, readJsonBody } =
    await import("@/lib/pipeline-auth.server");
  if (!(await authorizePipelineRequest(request))) return json({ error: "Unauthorized" }, 401);

  const body = await readJsonBody(request);
  const workflowId = typeof body["workflow_id"] === "string" ? body["workflow_id"] : null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { invokeEdgeFunction } = await import("@/lib/edge-functions.server");
  const { runSchedulerPass } = await import("@/lib/workflow-scheduler.server");

  // Trigger process-scheduled-cron edge function
  void invokeEdgeFunction("process-scheduled-cron", workflowId ? { workflowId } : {});

  const handled = await runSchedulerPass(supabaseAdmin, { workflowId });
  return json({ ok: true, handled });
}

export const Route = createFileRoute("/api/public/workflows/scheduler")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
