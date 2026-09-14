/**
 * Server-only job executors.
 *
 * Every generation the studio can start runs through here, driven by the
 * worker route. Executors are single *steps*: they either finish the job or
 * hand back the state needed to resume later (used by video, which polls a
 * provider request id across several worker runs).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { JobKind, JobResult } from "@/lib/jobs.shared";

export type JobRow = {
  id: string;
  user_id: string;
  kind: JobKind;
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

export type StepOutcome =
  | { done: true; result: JobResult; generationId?: string | null }
  | { done: false; state: Record<string, unknown>; delaySeconds: number; generationId?: string | null };

const asString = (v: unknown) => (typeof v === "string" ? v : undefined);
const asNumber = (v: unknown) => (typeof v === "number" ? v : undefined);
const asBool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

/** Extracts an HTTP status out of provider error messages like "failed (429): ...". */
export function statusFromError(message: string): number | null {
  const match = message.match(/\((\d{3})\)/);
  return match ? Number(match[1]) : null;
}

/* ------------------------------------------------------------------ image */

export async function runImage(
  userId: string,
  data: {
    prompt: string;
    model: string;
    aspect?: string | undefined;
    seed?: number | undefined;
    negativePrompt?: string | undefined;
    referenceUrls?: string[] | undefined;
    virtualModelId?: string | undefined;
    resolution?: string | undefined;
    style?: string | undefined;
    styleStrength?: number | undefined;
    referenceModes?: string[] | undefined;
    referenceWeight?: number | undefined;
  },
) {
  const providers = await import("@/lib/providers.server");
  const storage = await import("@/lib/storage.server");

  const aspect = data.aspect ?? "1:1";
  const resolutionBase =
    data.resolution === "1K" ? 896 : data.resolution === "4K" ? 1280 : data.resolution === "8K" ? 1408 : 1088;
  const { width, height } = providers.sizeForAspect(aspect, resolutionBase);
  const refs = (data.referenceUrls ?? []).filter(Boolean);
  const styleStrength = Math.max(0, Math.min(100, data.styleStrength ?? 65));
  const style = data.style?.trim();
  const referenceModes = (data.referenceModes ?? []).filter(Boolean);
  const finalPrompt = [
    data.prompt.trim(),
    style && style.toLowerCase() !== "none"
      ? `${style} visual style, style influence ${styleStrength} percent`
      : "",
    refs.length && referenceModes.length
      ? `Use the supplied image as ${referenceModes.join(", ").toLowerCase()} guidance with ${Math.max(0, Math.min(100, data.referenceWeight ?? 50))} percent influence`
      : "",
    `compose strictly for a ${aspect} canvas`,
    data.resolution ? `${data.resolution} high-detail output` : "",
    data.negativePrompt?.trim()
      ? `Exclude all of the following from the image: ${data.negativePrompt.trim()}`
      : "",
  ].filter(Boolean).join(". ");

  let storagePath: string;
  try {
    if (data.model === "hyper-image-quality") {
      const dataUrl = await providers.lovableGeminiImage({
        prompt: finalPrompt,
        imageUrls: refs,
      });
      const { bytes, contentType } = storage.dataUrlToBytes(dataUrl);
      storagePath = await storage.uploadBytes(
        storage.GENERATIONS_BUCKET,
        userId,
        bytes,
        contentType,
      );
    } else if (data.model === "hyper-image-speed") {
      const url = await providers.pixazoFluxSchnell({
        prompt: finalPrompt,
        width,
        height,
        seed: data.seed,
      });
      storagePath = await storage.uploadFromUrl(storage.GENERATIONS_BUCKET, userId, url);
    } else {
      const url = await providers.pixazoImage({
        prompt: finalPrompt,
        width,
        height,
        seed: data.seed,
        negativePrompt: data.negativePrompt,
        imageUrl: refs[0],
        strength: refs[0]
          ? Number((0.35 + (1 - Math.max(0, Math.min(100, data.referenceWeight ?? 50)) / 100) * 0.5).toFixed(2))
          : undefined,
      });
      storagePath = await storage.uploadFromUrl(storage.GENERATIONS_BUCKET, userId, url);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    await supabaseAdmin.from("generations").insert({
      user_id: userId,
      kind: "image",
      model: data.model,
      prompt: finalPrompt,
      status: "failed",
      error: message,
      params: { aspect },
    });
    throw new Error(message);
  }

  const { data: row, error } = await supabaseAdmin
    .from("generations")
    .insert({
      user_id: userId,
      kind: "image",
      model: data.model,
      prompt: data.prompt,
      status: "completed",
      storage_path: storagePath,
      params: {
        aspect,
        resolution: data.resolution ?? "2K",
        style: style ?? null,
        styleStrength,
        referenceModes,
        referenceWeight: data.referenceWeight ?? null,
        seed: data.seed ?? null,
      },
      virtual_model_id: data.virtualModelId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: row.id as string,
    url: await storage.signedUrl(storage.GENERATIONS_BUCKET, storagePath),
  };
}

/* ------------------------------------------------------------------ video */

export async function startVideoJob(
  userId: string,
  data: {
    prompt: string;
    imageUrl?: string | undefined;
    endImageUrl?: string | undefined;
    negative?: string | undefined;
    aspect?: string | undefined;
    seed?: number | undefined;
    frames?: number | undefined;
    frameRate?: number | undefined;
    resolution?: string | undefined;
  },
) {
  const providers = await import("@/lib/providers.server");
  const { videoSize } = await import("@/lib/media.shared");

  const aspect = data.aspect ?? "16:9";
  const resolution = data.resolution ?? "720p";
  const { width, height } = videoSize(aspect, resolution);

  const requestId = await providers.withRetry(() =>
    providers.pixazoStartVideo({
      prompt: data.prompt,
      imageUrl: data.imageUrl,
      endImageUrl: data.endImageUrl,
      negative: data.negative,
      aspect,
      seed: data.seed,
      frames: data.frames,
      frameRate: data.frameRate,
      width,
      height,
    }),
  );

  const { data: row, error } = await supabaseAdmin
    .from("generations")
    .insert({
      user_id: userId,
      kind: "video",
      model: "hyper-video-omni",
      prompt: data.prompt,
      status: "running",
      params: {
        requestId,
        aspect,
        resolution,
        frames: data.frames ?? null,
        frameRate: data.frameRate ?? null,
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string, requestId };
}

export async function pollVideoJob(userId: string, generationId: string, requestId: string) {
  const providers = await import("@/lib/providers.server");
  const storage = await import("@/lib/storage.server");

  const job = await providers.pixazoVideoStatus(requestId);

  if (job.status === "COMPLETED" && job.url) {
    const path = await storage.uploadFromUrl(storage.GENERATIONS_BUCKET, userId, job.url);
    await supabaseAdmin
      .from("generations")
      .update({ status: "completed", storage_path: path })
      .eq("id", generationId)
      .eq("user_id", userId);
    return {
      status: "completed" as const,
      url: await storage.signedUrl(storage.GENERATIONS_BUCKET, path),
    };
  }

  if (job.status === "ERROR" || job.status === "FAILED") {
    const message = job.error ?? "Video generation failed";
    await supabaseAdmin
      .from("generations")
      .update({ status: "failed", error: message })
      .eq("id", generationId)
      .eq("user_id", userId);
    return { status: "failed" as const, error: message };
  }

  return { status: "running" as const };
}

/* ------------------------------------------------------------------ audio */

export async function runSpeech(
  userId: string,
  data: {
    text: string;
    voice?: string | undefined;
    model?: string | undefined;
    tone?: string | undefined;
    pace?: number | undefined;
  },
) {
  const providers = await import("@/lib/providers.server");
  const storage = await import("@/lib/storage.server");
  const { styledSpeechText } = await import("@/lib/media.shared");

  const { bytes, contentType } = await providers.lovableSpeech({
    text: styledSpeechText(data.text, data.tone, data.pace),
    voice: data.voice,
    model: data.model,
  });
  const path = await storage.uploadBytes(storage.GENERATIONS_BUCKET, userId, bytes, contentType);
  const { data: row, error } = await supabaseAdmin
    .from("generations")
    .insert({
      user_id: userId,
      kind: "audio",
      model: "hyper-audio-omni",
      prompt: data.text,
      status: "completed",
      storage_path: path,
      params: {
        mode: "speech",
        voice: data.voice ?? "Kore",
        ttsModel: data.model ?? null,
        tone: data.tone ?? null,
        pace: data.pace ?? null,
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string, url: await storage.signedUrl(storage.GENERATIONS_BUCKET, path) };
}

export async function runMusic(
  userId: string,
  data: {
    prompt: string;
    genre?: string | undefined;
    mood?: string | undefined;
    tempo?: number | undefined;
    seconds?: number | undefined;
    instrumental?: boolean | undefined;
  },
) {
  const providers = await import("@/lib/providers.server");
  const storage = await import("@/lib/storage.server");

  const brief = [
    data.prompt,
    data.genre ? `${data.genre} genre` : "",
    data.mood ? `${data.mood} mood` : "",
    data.tempo ? `${data.tempo} BPM` : "",
    data.instrumental ? "instrumental only" : "",
  ]
    .filter(Boolean)
    .join(", ");

  try {
    const { bytes, contentType } = await providers.lovableMusic({
      prompt: brief,
      seconds: data.seconds,
    });
    const path = await storage.uploadBytes(storage.GENERATIONS_BUCKET, userId, bytes, contentType);
    const { data: row, error } = await supabaseAdmin
      .from("generations")
      .insert({
        user_id: userId,
        kind: "audio",
        model: "hyper-audio-omni",
        prompt: brief,
        status: "completed",
        storage_path: path,
        params: {
          mode: "music",
          genre: data.genre ?? null,
          mood: data.mood ?? null,
          tempo: data.tempo ?? null,
          seconds: data.seconds ?? null,
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, url: await storage.signedUrl(storage.GENERATIONS_BUCKET, path) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Music generation failed";
    await supabaseAdmin.from("generations").insert({
      user_id: userId,
      kind: "audio",
      model: "hyper-audio-omni",
      prompt: brief,
      status: "failed",
      error: message,
      params: { mode: "music" },
    });
    throw new Error(message);
  }
}

/* ------------------------------------------------------------- characters */

function asStringList(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
}

export async function runCharacterImage(userId: string, data: Record<string, unknown>) {
  const { renderCharacterImage } = await import("@/lib/virtual-model.server");
  const modelId = asString(data["modelId"]);
  if (!modelId) throw new Error("Missing character id");

  const { data: model, error } = await supabaseAdmin
    .from("virtual_models")
    .select("id, identity_prompt, seed, headshot_path, images, description")
    .eq("id", modelId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(error.message);

  return renderCharacterImage(userId, {
    modelId: model.id,
    identityPrompt: model.identity_prompt,
    seed: Number(model.seed),
    headshotPath: model.headshot_path,
    images: (model.images as never) ?? [],
    prompt: asString(data["prompt"]) ?? "",
    negativePrompt: asString(data["negativePrompt"]),
    aspect: asString(data["aspect"]),
    shot: asString(data["shot"]),
    consistency: asNumber(data["consistency"]),
    detail: asNumber(data["detail"]),
    faceLock: asBool(data["faceLock"]),
    variation: asNumber(data["variation"]),
    upscale: asBool(data["upscale"]),
    scene: {
      outfit: asStringList(data["outfit"]),
      accessories: asStringList(data["accessories"]),
      background: asString(data["background"]),
      lighting: asString(data["lighting"]),
      lens: asString(data["lens"]),
      depth: asNumber(data["depth"]),
      resolution: asString(data["resolution"]),
    },
    // The render style is stored as the last segment of the description.
    style: (model.description ?? "").split("·").pop()?.trim() || undefined,
  });
}

/* ------------------------------------------------------------ dispatching */

/** Runs one step of a job. Throws on failure; the worker decides retry vs fail. */
export async function runJobStep(job: JobRow): Promise<StepOutcome> {
  const input = job.input ?? {};

  switch (job.kind) {
    case "image": {
      const res = await runImage(job.user_id, input as never);
      return { done: true, result: { id: res.id, url: res.url, kind: "image" }, generationId: res.id };
    }
    case "speech": {
      const res = await runSpeech(job.user_id, input as never);
      return { done: true, result: { id: res.id, url: res.url, kind: "audio" }, generationId: res.id };
    }
    case "music": {
      const res = await runMusic(job.user_id, input as never);
      return { done: true, result: { id: res.id, url: res.url, kind: "audio" }, generationId: res.id };
    }
    case "character-image": {
      const res = await runCharacterImage(job.user_id, input);
      return { done: true, result: { id: res.id, url: res.url, kind: "image" }, generationId: res.id };
    }
    case "virtual-model": {
      const { buildCharacterProfile } = await import("@/lib/virtual-model.server");
      const res = await buildCharacterProfile(job.user_id, {
        name: asString(input["name"]) ?? "Character",
        description: asString(input["description"]) ?? "",
        identityPrompt: asString(input["identityPrompt"]) ?? "",
        seed: asNumber(input["seed"]),
        consistency: asNumber(input["consistency"]),
        style: asString(input["style"]),
        jobId: job.id,

      });
      return { done: true, result: { id: res.id, kind: "virtual-model" } };
    }
    case "video": {
      let generationId = asString(job.state["generationId"]);
      let requestId = asString(job.state["requestId"]);

      if (!generationId || !requestId) {
        const started = await startVideoJob(job.user_id, input as never);
        generationId = started.id;
        requestId = started.requestId;
      }

      const status = await pollVideoJob(job.user_id, generationId, requestId);
      if (status.status === "completed") {
        return {
          done: true,
          result: { id: generationId, url: status.url, kind: "video" },
          generationId,
        };
      }
      if (status.status === "failed") throw new Error(status.error);

      const polls = (asNumber(job.state["polls"]) ?? 0) + 1;
      if (polls > 240) throw new Error("Video generation timed out");
      return {
        done: false,
        state: { generationId, requestId, polls },
        delaySeconds: 5,
        generationId,
      };
    }
    default:
      throw new Error(`Unknown task type: ${job.kind}`);
  }
}
