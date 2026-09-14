import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { JobKind, JobRecord, JobResult, JobStatus } from "@/lib/jobs.shared";

/** Queues a generation task. The worker runs it server-side, page or no page. */
export const enqueueJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { kind: JobKind; label: string; input: Record<string, unknown> }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        kind: data.kind,
        input: { ...data.input, __label: data.label.slice(0, 200) },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/** The signed-in user's tasks, newest first, with fresh signed result URLs. */
export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<JobRecord[]> => {
    const storage = await import("@/lib/storage.server");
    const { data: rows, error } = await context.supabase
      .from("jobs")
      .select("id, kind, status, input, result, error, attempts, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (error) throw new Error(error.message);

    const genIds = (rows ?? [])
      .map((r) => (r.result as JobResult | null)?.id)
      .filter((id): id is string => !!id);

    const urlById = new Map<string, string | null>();
    if (genIds.length) {
      const { data: gens } = await context.supabase
        .from("generations")
        .select("id, storage_path")
        .in("id", genIds);
      const paths = (gens ?? [])
        .map((g) => g.storage_path)
        .filter((p): p is string => !!p);
      const signed = await storage.signedUrls(storage.GENERATIONS_BUCKET, paths);
      for (const g of gens ?? []) {
        urlById.set(g.id, g.storage_path ? (signed[g.storage_path] ?? null) : null);
      }
    }

    return (rows ?? []).map((r) => {
      const result = (r.result as JobResult | null) ?? null;
      const fresh = result?.id ? urlById.get(result.id) : undefined;
      return {
        id: r.id,
        kind: r.kind as JobKind,
        status: r.status as JobStatus,
        label: String((r.input as Record<string, unknown> | null)?.["__label"] ?? ""),
        attempts: r.attempts,
        error: r.error,
        result: result ? { ...result, url: fresh ?? result.url ?? null } : null,
        createdAt: r.created_at,
        finishedAt: r.finished_at,
      };
    });
  });

export const cancelJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .update({ status: "canceled", finished_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["queued", "running"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Single task lookup used by the client while a task is running. */
export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<JobRecord | null> => {
    const storage = await import("@/lib/storage.server");
    const { data: r, error } = await context.supabase
      .from("jobs")
      .select("id, kind, status, input, result, error, attempts, created_at, finished_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) return null;

    const result = (r.result as JobResult | null) ?? null;
    let url = result?.url ?? null;
    if (result?.id) {
      const { data: gen } = await context.supabase
        .from("generations")
        .select("storage_path")
        .eq("id", result.id)
        .maybeSingle();
      if (gen?.storage_path) {
        url = await storage.signedUrl(storage.GENERATIONS_BUCKET, gen.storage_path);
      }
    }

    return {
      id: r.id,
      kind: r.kind as JobKind,
      status: r.status as JobStatus,
      label: String((r.input as Record<string, unknown> | null)?.["__label"] ?? ""),
      attempts: r.attempts,
      error: r.error,
      result: result ? { ...result, url } : null,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    };
  });
