import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GenerationKind = "image" | "video" | "audio";

export type GenerationRecord = {
  id: string;
  kind: GenerationKind;
  model: string;
  prompt: string;
  status: string;
  url: string | null;
  error: string | null;
  createdAt: string;
};

/** Uploads a browser file (as a data URL) so providers can read it over HTTPS. */
export const uploadReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dataUrl: string }) => input)
  .handler(async ({ data, context }) => {
    const { dataUrlToBytes, uploadBytes, referenceUrl, GENERATIONS_BUCKET } = await import(
      "@/lib/storage.server"
    );
    const { bytes, contentType } = dataUrlToBytes(data.dataUrl);
    const path = await uploadBytes(GENERATIONS_BUCKET, context.userId, bytes, contentType);
    // Providers reject reference images over 1MB, so hand them a compressed
    // transformation URL instead of the raw (often multi-MB PNG) upload.
    return { path, url: await referenceUrl(GENERATIONS_BUCKET, path) };
  });

/** Saves an image that was streamed straight to the browser. */
export const saveImageResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { dataUrl: string; prompt: string; model: string; aspect?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const storage = await import("@/lib/storage.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { bytes, contentType } = storage.dataUrlToBytes(data.dataUrl);
    const path = await storage.uploadBytes(
      storage.GENERATIONS_BUCKET,
      context.userId,
      bytes,
      contentType,
    );
    const { data: row, error } = await supabaseAdmin
      .from("generations")
      .insert({
        user_id: context.userId,
        kind: "image",
        model: data.model,
        prompt: data.prompt,
        status: "completed",
        storage_path: path,
        params: { aspect: data.aspect ?? "1:1" },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** The signed-in user's generations, newest first, with fresh signed URLs. */
export const listGenerations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind?: GenerationKind; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<GenerationRecord[]> => {
    const storage = await import("@/lib/storage.server");
    let query = context.supabase
      .from("generations")
      .select("id, kind, model, prompt, status, error, storage_path, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 60);
    if (data.kind) query = query.eq("kind", data.kind);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const paths = (rows ?? []).map((r) => r.storage_path).filter((p): p is string => !!p);
    const urls = await storage.signedUrls(storage.GENERATIONS_BUCKET, paths);

    return (rows ?? []).map((r) => ({
      id: r.id,
      kind: r.kind as GenerationKind,
      model: r.model,
      prompt: r.prompt,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
      url: r.storage_path ? (urls[r.storage_path] ?? null) : null,
    }));
  });

export const deleteGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const storage = await import("@/lib/storage.server");
    const { data: row } = await context.supabase
      .from("generations")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("generations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.storage_path) {
      await storage.removeFiles(storage.GENERATIONS_BUCKET, [row.storage_path]);
    }
    return { ok: true };
  });
