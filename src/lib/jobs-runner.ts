/**
 * Client helpers for the background queue.
 *
 * Every studio action queues a job and then waits on it. The waiting is purely
 * cosmetic: the work runs on the server, so reloading or closing the page never
 * cancels it — the result lands in the user's library and tasks panel.
 */

import { supabase } from "@/integrations/supabase/client";
import { enqueueJob, getJob } from "@/lib/jobs.functions";
import type { JobKind, JobRecord } from "@/lib/jobs.shared";

const WORKER_URL = "/api/public/jobs/worker";

/** Nudges the worker so a fresh task starts immediately instead of on the next cron tick. */
export async function kickWorker() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(WORKER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // The cron safety net picks the task up either way.
  }
}

export async function queueJob(kind: JobKind, label: string, input: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("You're previewing as a guest — create a free account to start generating.");
  }
  const { id } = await enqueueJob({ data: { kind, label, input } });
  void kickWorker();
  return id;
}

export type WaitOptions = {
  signal?: AbortSignal;
  onUpdate?: (job: JobRecord) => void;
};

/** Polls a queued task until it settles. Aborting only stops watching, not the task. */
export async function waitForJob(id: string, options: WaitOptions = {}): Promise<JobRecord> {
  let delay = 1500;
  let idleTicks = 0;
  for (;;) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const job = await getJob({ data: { id } });
    if (!job) throw new Error("Task not found");
    options.onUpdate?.(job);

    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "Task failed");
    if (job.status === "canceled") throw new Error("Task canceled");

    // Nothing picked it up for a while — kick the worker again.
    idleTicks += 1;
    if (job.status === "queued" && idleTicks % 8 === 0) void kickWorker();

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(5000, Math.round(delay * 1.2));
  }
}

/** Queue + wait, returning the finished task's result. */
export async function runJob(
  kind: JobKind,
  label: string,
  input: Record<string, unknown>,
  options: WaitOptions = {},
) {
  const id = await queueJob(kind, label, input);
  const job = await waitForJob(id, options);
  return { jobId: id, id: job.result?.id ?? "", url: job.result?.url ?? null };
}
