/**
 * Background job worker (server-only).
 *
 * Claims a bounded batch of due jobs, runs one step of each and persists the
 * outcome. Safe to call concurrently: a lease row single-flights the runner and
 * `claim_jobs` hands each job to exactly one run.
 *
 * A run keeps itself alive for up to `budgetMs` while more work is due soon
 * (video polls re-queue with a short delay), so multi-step jobs finish in one
 * wake-up instead of waiting for the next database tick between hops.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runJobStep, statusFromError, type JobRow } from "@/lib/jobs.server";

type Admin = SupabaseClient<Database>;

const BATCH = 3;
const LEASE_SECONDS = 600;
const RUNNER_LOCK_SECONDS = 120;
const DEFAULT_BUDGET_MS = 50_000;
const MIN_IDLE_WAIT_MS = 1_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type JobOutcome = "ok" | "paused" | "resumed";

async function processJob(admin: Admin, job: JobRow, paused: boolean): Promise<JobOutcome> {
  try {
    const outcome = await runJobStep(job);
    if (outcome.done) {
      await admin
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
      await admin
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
      await admin
        .from("job_runner")
        .update({ paused: false, paused_reason: null, paused_at: null })
        .eq("id", "default");
      return "resumed";
    }
    return "ok";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Task failed";
    const status = statusFromError(message);

    if (status === 402 || status === 403) {
      // Circuit breaker: stop all background work until credits/access return.
      await admin
        .from("job_runner")
        .update({
          paused: true,
          paused_reason: message.slice(0, 500),
          paused_at: new Date().toISOString(),
        })
        .eq("id", "default");
      await admin
        .from("jobs")
        .update({
          status: "queued",
          error: message,
          lease_until: null,
          attempts: Math.max(0, job.attempts - 1),
          next_run_at: new Date(Date.now() + 300_000).toISOString(),
        })
        .eq("id", job.id);
      return "paused";
    }

    const retryable = status === 429 || status === null || status >= 500;
    const canRetry = retryable && job.attempts < job.max_attempts;
    if (canRetry) {
      const backoff = Math.min(300, 15 * 2 ** (job.attempts - 1));
      await admin
        .from("jobs")
        .update({
          status: "queued",
          error: message,
          lease_until: null,
          next_run_at: new Date(Date.now() + backoff * 1000).toISOString(),
        })
        .eq("id", job.id);
    } else {
      await admin
        .from("jobs")
        .update({
          status: "failed",
          error: message,
          lease_until: null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    return "ok";
  }
}

export type WorkerPassResult = {
  processed: number;
  paused: boolean;
  skipped?: "busy";
};

export async function runWorkerPass(
  admin: Admin,
  options: { budgetMs?: number } = {},
): Promise<WorkerPassResult> {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();

  // Paused by a credit/policy circuit breaker? Only let a single probe through.
  const { data: runner } = await admin
    .from("job_runner")
    .select("paused")
    .eq("id", "default")
    .maybeSingle();
  let paused = runner?.paused === true;

  // Single-flight: only one worker run at a time holds the lease.
  const lockUntil = () => new Date(Date.now() + RUNNER_LOCK_SECONDS * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const { data: locked } = await admin
    .from("job_runner")
    .update({ lock_until: lockUntil() })
    .eq("id", "default")
    .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();
  if (!locked) return { processed: 0, paused, skipped: "busy" };

  let processed = 0;
  try {
    for (;;) {
      const { data: claimed, error } = await admin.rpc("claim_jobs", {
        p_limit: paused ? 1 : BATCH,
        p_lease_seconds: LEASE_SECONDS,
      });
      if (error) throw new Error(error.message);
      const jobs = (claimed ?? []) as unknown as JobRow[];

      let tripped = false;
      for (const job of jobs) {
        processed += 1;
        const outcome = await processJob(admin, job, paused);
        if (outcome === "resumed") paused = false;
        if (outcome === "paused") {
          paused = true;
          tripped = true;
          break;
        }
      }
      if (tripped) break;

      // Anything due within this run's budget? Stay alive for it.
      const { data: next } = await admin
        .from("jobs")
        .select("next_run_at")
        .eq("status", "queued")
        .order("next_run_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next) break;

      const remaining = budgetMs - (Date.now() - startedAt);
      const waitMs = Math.max(
        jobs.length ? 0 : MIN_IDLE_WAIT_MS,
        new Date(next.next_run_at).getTime() - Date.now(),
      );
      if (waitMs > remaining) break;
      if (waitMs > 0) await sleep(waitMs);
      await admin.from("job_runner").update({ lock_until: lockUntil() }).eq("id", "default");
    }
  } finally {
    await admin.from("job_runner").update({ lock_until: null }).eq("id", "default");
  }

  return { processed, paused };
}
