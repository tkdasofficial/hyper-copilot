/**
 * Video render dispatcher endpoint.
 *
 * Called only by the database (`videos_dispatch_pipeline` trigger) when a new
 * video request row appears. Reserves the credit and hands the request to the
 * external render pipeline — nothing about this step depends on the browser.
 */

import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { authorizePipelineRequest, json, readJsonBody } =
    await import("@/lib/pipeline-auth.server");
  if (!(await authorizePipelineRequest(request))) return json({ error: "Unauthorized" }, 401);

  const body = await readJsonBody(request);
  const videoId = typeof body["video_id"] === "string" ? body["video_id"] : null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispatchPendingRenders } = await import("@/lib/video-agent.server");
  const dispatched = await dispatchPendingRenders(supabaseAdmin, { videoId });
  return json({ ok: true, dispatched });
}

export const Route = createFileRoute("/api/public/pipeline/render")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
