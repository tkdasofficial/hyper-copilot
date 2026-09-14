/**
 * Background job worker.
 *
 * Claims a bounded batch of due jobs, runs one step of each, and persists the
 * outcome. Safe to call concurrently: a lease row single-flights the runner and
 * `claim_jobs` hands each job to exactly one run.
 *
 * Callers: the app (signed-in user kicks it right after queueing) and pg_cron
 * (safety net, so work continues when nobody has the page open).
 */

import { createFileRoute } from "@tanstack/react-router";

const BATCH = 3;
const LEASE_SECONDS = 600;
const RUNNER_LOCK_SECONDS = 120;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function authorize(request: Request) {
  // Scheduled runs present a token that lives only in the database vault.
  const provided = request.headers.get("x-worker-secret");
  if (provided) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("verify_worker_token", { p_token: provided });
    if (data === true) return true;
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await client.auth.getUser(auth.slice(7));
    if (data.user) return true;
  }
  return false;
}

async function handle(request: Request) {
  if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runJobStep, statusFromError } = await import("@/lib/jobs.server");
  type JobRow = import("@/lib/jobs.server").JobRow;

  // Paused by a credit/policy circuit breaker? Only let a single probe through.
  const { data: runner } = await supabaseAdmin
    .from("job_runner")
    .select("paused, paused_reason")
    .eq("id", "default")
    .maybeSingle();
  const paused = runner?.paused === true;
  const limit = paused ? 1 : BATCH;

  // Single-flight: only one worker run at a time holds the lease.
  const nowIso = new Date().toISOString();
  const { data: locked } = await supabaseAdmin
    .from("job_runner")
    .update({ lock_until: new Date(Date.now() + RUNNER_LOCK_SECONDS * 1000).toISOString() })
    .eq("id", "default")
    .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();
  if (!locked) return json({ skipped: "busy" });

  let processed = 0;
  try {
    const { data: claimed, error } = await supabaseAdmin.rpc("claim_jobs", {
      p_limit: limit,
      p_lease_seconds: LEASE_SECONDS,
    });
    if (error) throw new Error(error.message);

    for (const job of (claimed ?? []) as unknown as JobRow[]) {
      processed += 1;
      try {
        const outcome = await runJobStep(job);
        if (outcome.done) {
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "completed",
              result: outcome.result as never,
              error: null,
              lease_until: null,
              finished_at: new Date().toISOString(),
              ...(outcome.generationId ? { generation_id: outcome.generationId } : {}),
            })
            .eq("id", job.id);
        } else {
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "queued",
              state: outcome.state as never,
              lease_until: null,
              // A poll hop is not a failed attempt.
              attempts: job.attempts - 1,
              next_run_at: new Date(Date.now() + outcome.delaySeconds * 1000).toISOString(),
              ...(outcome.generationId ? { generation_id: outcome.generationId } : {}),
            })
            .eq("id", job.id);
        }
        if (paused) {
          // The probe succeeded — credits/access are back.
          await supabaseAdmin
            .from("job_runner")
            .update({ paused: false, paused_reason: null, paused_at: null })
            .eq("id", "default");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Task failed";
        const status = statusFromError(message);

        if (status === 402 || status === 403) {
          // Circuit breaker: stop all background work until credits/access return.
          await supabaseAdmin
            .from("job_runner")
            .update({
              paused: true,
              paused_reason: message.slice(0, 500),
              paused_at: new Date().toISOString(),
            })
            .eq("id", "default");
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "queued",
              error: message,
              lease_until: null,
              attempts: Math.max(0, job.attempts - 1),
              next_run_at: new Date(Date.now() + 300_000).toISOString(),
            })
            .eq("id", job.id);
          break;
        }

        const retryable = status === 429 || status === null || status >= 500;
        const canRetry = retryable && job.attempts < job.max_attempts;
        if (canRetry) {
          const backoff = Math.min(300, 15 * 2 ** (job.attempts - 1));
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "queued",
              error: message,
              lease_until: null,
              next_run_at: new Date(Date.now() + backoff * 1000).toISOString(),
            })
            .eq("id", job.id);
        } else {
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "failed",
              error: message,
              lease_until: null,
              finished_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
      }
    }
  } finally {
    await supabaseAdmin.from("job_runner").update({ lock_until: null }).eq("id", "default");
  }

  return json({ processed, paused });
}

export const Route = createFileRoute("/api/public/jobs/worker")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
