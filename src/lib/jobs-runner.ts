/**
 * Client helpers for the background queue.
 *
 * Every studio action records a task and then watches it. The browser never
 * starts or nudges the worker: a database trigger on the new task row wakes the
 * server-side pipeline, so reloading or closing the page never affects the
 * work — the result lands in the user's library and tasks panel.
 */

import { supabase } from "@/integrations/supabase/client";
import { enqueueJob, getJob } from "@/lib/jobs.functions";
import type { JobKind, JobRecord } from "@/lib/jobs.shared";

export async function queueJob(kind: JobKind, label: string, input: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("You're previewing as a guest — create a free account to start generating.");
  }
  const { id } = await enqueueJob({ data: { kind, label, input } });
  return id;
}

export type WaitOptions = {
  signal?: AbortSignal;
  onUpdate?: (job: JobRecord) => void;
};

/** Watches a queued task until it settles. Aborting only stops watching, not the task. */
export async function waitForJob(id: string, options: WaitOptions = {}): Promise<JobRecord> {
  let delay = 1500;
  for (;;) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const job = await getJob({ data: { id } });
    if (!job) throw new Error("Task not found");
    options.onUpdate?.(job);

    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error ?? "Task failed");
    if (job.status === "canceled") throw new Error("Task canceled");

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(5000, Math.round(delay * 1.2));
  }
}

/** Queue + watch, returning the finished task's result. */
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
