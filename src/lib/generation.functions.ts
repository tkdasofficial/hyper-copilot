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
  fileId?: string | null;
  directDownloadUrl?: string | null;
};

/** Uploads a browser file (as a data URL) so providers can read it over HTTPS. */
export const uploadReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dataUrl: string }) => input)
  .handler(async ({ data, context }) => {
    const { dataUrlToBytes, uploadBytes, referenceUrl, GENERATIONS_BUCKET } =
      await import("@/lib/storage.server");
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
    const limit = data.limit ?? 60;

    let generationsItems: GenerationRecord[] = [];
    if (!data.kind || data.kind === "image" || data.kind === "audio" || data.kind === "video") {
      let query = context.supabase
        .from("generations")
        .select("id, kind, model, prompt, status, error, storage_path, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (data.kind) query = query.eq("kind", data.kind);

      const { data: rows, error } = await query;
      if (!error && rows) {
        const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
        const urls = await storage.signedUrls(storage.GENERATIONS_BUCKET, paths);

        generationsItems = rows.map((r) => ({
          id: r.id,
          kind: r.kind as GenerationKind,
          model: r.model,
          prompt: r.prompt,
          status: r.status,
          error: r.error,
          createdAt: r.created_at,
          url: r.storage_path ? (urls[r.storage_path] ?? null) : null,
        }));
      }
    }

    let videoItems: GenerationRecord[] = [];
    if (!data.kind || data.kind === "video") {
      const { data: vRows } = await context.supabase
        .from("videos")
        .select(
          "id, prompt, title, image_style, quality, status, error, video_url, direct_download_url, file_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (vRows) {
        videoItems = vRows.map((v) => {
          let directUrl = v.direct_download_url || v.video_url || null;
          if (v.file_id && (!directUrl || directUrl.includes("drive.google.com"))) {
            directUrl = `https://drive.google.com/uc?export=download&id=${v.file_id}`;
          }

          return {
            id: v.id,
            kind: "video" as const,
            model: v.image_style ? `${v.image_style} · ${v.quality || "1080p"}` : "Video Agent",
            prompt: v.prompt || v.title || "AI Generated Video",
            status: v.status || "completed",
            error: v.error || null,
            createdAt: v.created_at,
            url: directUrl,
            fileId: v.file_id ?? null,
            directDownloadUrl: directUrl,
          };
        });
      }
    }

    // Merge and deduplicate by ID (in case a generation and video share ID)
    const seen = new Set<string>();
    const combined: GenerationRecord[] = [];

    for (const item of [...videoItems, ...generationsItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }

    // Sort newest first
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return combined.slice(0, limit);
  });

export const deleteGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    // Attempt deleting from videos table
    await context.supabase.from("videos").delete().eq("id", data.id);

    const { invokeEdgeFunction } = await import("@/lib/edge-functions.server");
    const { error } = await invokeEdgeFunction("update-record-handler", {
      userId: context.userId,
      table: "generations",
      operation: "delete",
      recordId: data.id,
    });

    if (error) {
      // Graceful fallback to direct context if edge function has a transient issue
      const storage = await import("@/lib/storage.server");
      const { data: row } = await context.supabase
        .from("generations")
        .select("storage_path")
        .eq("id", data.id)
        .maybeSingle();
      const { error: delErr } = await context.supabase
        .from("generations")
        .delete()
        .eq("id", data.id);
      if (delErr) {
        // ignore if already deleted from videos
      }
      if (row?.storage_path) {
        await storage.removeFiles(storage.GENERATIONS_BUCKET, [row.storage_path]);
      }
    }
    return { ok: true };
  });
