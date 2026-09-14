/**
 * Background job worker endpoint.
 *
 * Called only by the database: the `jobs_dispatch_worker` trigger fires it the
 * moment a task is queued, and the per-minute pipeline tick resumes anything
 * that lost its run. The browser never calls this route.
 */

import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { authorizePipelineRequest, json } = await import("@/lib/pipeline-auth.server");
  if (!(await authorizePipelineRequest(request))) return json({ error: "Unauthorized" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runWorkerPass } = await import("@/lib/jobs-worker.server");
  return json(await runWorkerPass(supabaseAdmin));
}

export const Route = createFileRoute("/api/public/jobs/worker")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
});
