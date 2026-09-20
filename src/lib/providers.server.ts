/**
 * Server-only generation providers.
 *
 * Pixazo  — Stable Diffusion Inpainting (text-to-image + image-to-image),
 *           Flux 1 Schnell (text-to-image), LTX video (text/image-to-video).
 * Lovable — Gemini image models and Gemini TTS through the AI Gateway.
 */

import { providerSecret } from "@/lib/provider-secrets.server";

const PIXAZO_BASE = "https://gateway.pixazo.ai";
const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";

/** The Pixazo key lives in the Supabase backend vault, not in app env config. */
async function pixazoKey() {
  return providerSecret("PIXAZO_API_KEY");
}

function lovableKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

async function pixazoPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${PIXAZO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Ocp-Apim-Subscription-Key": await pixazoKey(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Generation failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

/** Aspect ratio label -> pixel size, rounded to multiples of 32. */
export function sizeForAspect(aspect: string, base = 1024): { width: number; height: number } {
  const [wRaw, hRaw] = aspect.split(":").map((n) => Number(n));
  const w = Number.isFinite(wRaw) && wRaw ? wRaw : 1;
  const h = Number.isFinite(hRaw) && hRaw ? hRaw : 1;
  const scale = base / Math.sqrt(w * h);
  const round = (v: number) => Math.max(256, Math.min(1536, Math.round((v * scale) / 32) * 32));
  return { width: round(w), height: round(h) };
}

/** Quality guard rails applied to every Pixazo image request. */
const DEFAULT_NEGATIVE =
  "lowres, worst quality, low quality, jpeg artifacts, blurry, out of focus, deformed, disfigured, mutated, extra limbs, extra fingers, bad anatomy, bad proportions, watermark, text, logo, signature, cropped, duplicate, glitch, noise, grain, oversaturated, creepy, horror";

/**
 * Stable Diffusion Inpainting — image-to-image only.
 *
 * The provider endpoint composites onto a fixed built-in base photo when no
 * `imageUrl` is supplied, which produced nonsense output. Callers must pass a
 * source image; use `pixazoImage` for prompt-only requests.
 */
export async function pixazoStableDiffusion(input: {
  prompt: string;
  imageUrl: string;
  maskUrl?: string | undefined;
  negativePrompt?: string | undefined;
  width: number;
  height: number;
  seed?: number | undefined;
  steps?: number | undefined;
  guidance?: number | undefined;
  /** Denoise amount: lower keeps the reference identity, higher allows change. */
  strength?: number | undefined;
}): Promise<string> {
  const base = {
    prompt: input.prompt,
    imageUrl: input.imageUrl,
    ...(input.maskUrl ? { maskUrl: input.maskUrl } : {}),
    negative_prompt: [input.negativePrompt, DEFAULT_NEGATIVE].filter(Boolean).join(", "),
    width: input.width,
    height: input.height,
    num_steps: input.steps ?? 30,
    guidance: input.guidance ?? 7.5,
    ...(input.seed === undefined ? {} : { seed: input.seed }),
  };
  const withStrength = input.strength === undefined ? base : { ...base, strength: input.strength };

  let data: { imageUrl?: string; output?: string };
  try {
    data = await pixazoPost("/inpainting/v1/getImage", withStrength);
  } catch (err) {
    // Only retry without the optional field when the request schema rejects it.
    // Retrying rate limits, oversized inputs, auth failures, or provider faults
    // here both duplicates work and silently drops the user's influence setting.
    const message = err instanceof Error ? err.message : "";
    const unsupportedField =
      /\((400|422)\)/.test(message) && /strength|unknown|unsupported|field|schema/i.test(message);
    if (input.strength === undefined || !unsupportedField) throw err;
    data = await pixazoPost("/inpainting/v1/getImage", base);
  }
  const url = data.imageUrl ?? data.output;
  if (!url) throw new Error("Image provider returned no image");
  return url;
}

/**
 * Milliseconds to wait before retrying a rate-limited (429) call, parsed from
 * the provider's error body ("Try again in N seconds.") plus a small buffer.
 * Returns null when the error is not a retryable rate limit.
 */
function rateLimitWaitMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  if (!/\(429\)/.test(err.message)) return null;
  const match = /try again in (\d+)\s*second/i.exec(err.message);
  const seconds = match ? Number(match[1]) : 5;
  return Math.min(seconds * 1000 + 1500, 60_000);
}

/**
 * Retries a provider call on transient failures. A 429 waits out the
 * provider's own cooldown ("Try again in N seconds") instead of the old
 * 800ms backoff that guaranteed a second rate-limit rejection.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i >= attempts - 1) break;
      const wait = rateLimitWaitMs(err);
      await new Promise((r) => setTimeout(r, wait ?? 800 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Generation failed");
}

/** Hyper Image Speed — Flux 1 Schnell (text-to-image only). */
export async function pixazoFluxSchnell(input: {
  prompt: string;
  width: number;
  height: number;
  seed?: number | undefined;
  steps?: number | undefined;
}): Promise<string> {
  const data = await pixazoPost<{ output?: string; imageUrl?: string }>(
    "/flux-1-schnell/v1/getData",
    {
      prompt: input.prompt,
      num_steps: Math.min(8, Math.max(4, input.steps ?? 8)),
      width: input.width,
      height: input.height,
      ...(input.seed === undefined ? {} : { seed: input.seed }),
    },
  );
  const url = data.output ?? data.imageUrl;
  if (!url) throw new Error("Image provider returned no image");
  return url;
}

/**
 * Hyper Image Flash — routes to the right Pixazo model for the request:
 * a reference image goes to Stable Diffusion Inpainting (image-to-image),
 * a prompt-only request goes to a real text-to-image model.
 */
export async function pixazoImage(input: {
  prompt: string;
  imageUrl?: string | undefined;
  maskUrl?: string | undefined;
  negativePrompt?: string | undefined;
  width: number;
  height: number;
  seed?: number | undefined;
  steps?: number | undefined;
  guidance?: number | undefined;
  strength?: number | undefined;
}): Promise<string> {
  if (input.imageUrl) {
    const imageUrl = input.imageUrl;
    return withRetry(() => pixazoStableDiffusion({ ...input, imageUrl }));
  }
  return withRetry(() =>
    pixazoFluxSchnell({
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      seed: input.seed,
    }),
  );
}

/** Hyper Video Omni — LTX free tier. Returns an async job id. */
export async function pixazoStartVideo(input: {
  prompt: string;
  imageUrl?: string | undefined;
  endImageUrl?: string | undefined;
  negative?: string | undefined;
  aspect?: string | undefined;
  seed?: number | undefined;
  frames?: number | undefined;
  frameRate?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}): Promise<string> {
  const endpoints = input.imageUrl
    ? ["/ltx-2-5-free/v1/image-to-video", "/ltx-video/v1/image-to-video"]
    : ["/ltx-2-5-free/v1/text-to-video", "/ltx-video/v1/text-to-video"];

  const body = {
    prompt: input.prompt,
    ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
    ...(input.endImageUrl ? { end_image_url: input.endImageUrl } : {}),
    ...(input.negative ? { negative: input.negative } : {}),
    ...(input.aspect ? { aspect: input.aspect } : {}),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    ...(input.frames ? { num_frames: input.frames } : {}),
    ...(input.frameRate ? { frame_rate: input.frameRate } : {}),
    ...(input.width && input.height ? { width: input.width, height: input.height } : {}),
  };
  let lastErr: unknown;
  for (const path of endpoints) {
    try {
      const data = await pixazoPost<{ request_id?: string; requestId?: string }>(path, body);
      const reqId = data.request_id ?? data.requestId;
      if (reqId) return reqId;
    } catch (err) {
      lastErr = err;
      // Some deployments reject optional fields; try minimal body
      const minimal = {
        prompt: input.prompt,
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        ...(input.negative ? { negative: input.negative } : {}),
        ...(input.frames ? { num_frames: input.frames } : {}),
        ...(input.frameRate ? { frame_rate: input.frameRate } : {}),
      };
      try {
        const data = await pixazoPost<{ request_id?: string; requestId?: string }>(path, minimal);
        const reqId = data.request_id ?? data.requestId;
        if (reqId) return reqId;
      } catch (subErr) {
        lastErr = subErr;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Video provider returned no job id");
}

export type VideoJob = { status: string; url?: string | undefined; error?: string | undefined };

export async function pixazoVideoStatus(requestId: string): Promise<VideoJob> {
  const res = await fetch(`${PIXAZO_BASE}/v2/requests/status/${requestId}`, {
    headers: { "Ocp-Apim-Subscription-Key": await pixazoKey() },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Video status failed (${res.status}): ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as {
    status?: string;
    error?: string;
    output?: { media_url?: string[] };
  };
  const status = (data.status ?? "PROCESSING").toUpperCase();
  return {
    status,
    url: data.output?.media_url?.[0],
    error: data.error,
  };
}

/** Hyper Image Quality — Gemini image model on the Lovable AI Gateway. */
export async function lovableGeminiImage(input: {
  prompt: string;
  model?: string | undefined;
  imageUrls?: string[] | undefined;
}): Promise<string> {
  const content: unknown[] = [{ type: "text", text: input.prompt }];
  for (const url of input.imageUrls ?? []) {
    content.push({ type: "image_url", image_url: { url } });
  }
  const res = await fetch(`${LOVABLE_BASE}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? "google/gemini-3.1-flash-image",
      messages: [
        { role: "user", content: (input.imageUrls ?? []).length ? content : input.prompt },
      ],
      modalities: ["image", "text"],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image");
  return `data:image/png;base64,${b64}`;
}

/** Hyper Audio Omni (speech) — Gemini TTS on the Lovable AI Gateway. Returns WAV bytes. */
export async function lovableSpeech(input: {
  text: string;
  voice?: string | undefined;
  model?: string | undefined;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(`${LOVABLE_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? "google/gemini-2.5-flash-tts",
      contents: [{ role: "user", parts: [{ text: input.text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice ?? "Kore" } },
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Speech generation failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, contentType: res.headers.get("content-type") ?? "audio/wav" };
}

/**
 * Hyper Audio Omni (music) — text to music on the Lovable AI Gateway.
 * The gateway currently exposes no music model, so this raises a clear,
 * user-facing message instead of an opaque provider error.
 */
export async function lovableMusic(input: {
  prompt: string;
  seconds?: number | undefined;
  model?: string | undefined;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(`${LOVABLE_BASE}/audio/music`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? "google/lyria-002",
      prompt: input.prompt,
      ...(input.seconds ? { duration_seconds: input.seconds } : {}),
    }),
  });
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) {
      throw new Error(
        "Music generation is not enabled on this workspace yet — no music model is available on the AI gateway. Text to speech is fully available in the meantime.",
      );
    }
    const text = await res.text();
    throw new Error(`Music generation failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType: res.headers.get("content-type") ?? "audio/wav" };
}

/**
 * Text-To-Text: Nvidia Nemotron 3 Ultra (nemotron-3-ultra-550b-a55b).
 * Provides intelligent conversational AI, creative brainstorms, video scripts, and copy.
 */
export async function nvidiaNemotronText(input: {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}): Promise<{ text: string; model: string }> {
  let apiKey = "";
  try {
    apiKey = await providerSecret("NVIDIA_API_KEY");
  } catch {
    apiKey = (process.env["NVIDIA_API_KEY"] ?? "").trim();
  }

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not configured in backend secrets.");
  }

  const messages: Array<{ role: string; content: string }> = [];
  const system =
    input.systemPrompt ??
    "You are Copilot, a brilliant AI creative assistant. You excel at high-retention video scripts, social media hooks, marketing campaign strategies, and multimodal ideation. Always format your responses cleanly with markdown when appropriate.";

  messages.push({ role: "system", content: system });

  if (input.messages && input.messages.length > 0) {
    for (const msg of input.messages) {
      if (msg.role !== "system" && msg.content?.trim()) {
        messages.push({ role: msg.role, content: msg.content.trim() });
      }
    }
  }

  if (
    input.prompt &&
    (!messages.length || messages[messages.length - 1]?.content !== input.prompt)
  ) {
    messages.push({ role: "user", content: input.prompt });
  }

  const models = ["nvidia/nemotron-3-ultra-550b-a55b", "nemotron-3-ultra-550b-a55b"];

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.6,
          top_p: 0.8,
          max_tokens: 2048,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Nvidia Nemotron error (${res.status}): ${text.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = json.choices?.[0]?.message?.content ?? "";
      if (!reply) throw new Error("Nvidia Nemotron returned an empty response.");
      return { text: reply, model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!lastError.message.includes("404") && !lastError.message.includes("model")) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Failed to call Nvidia Nemotron 3 Ultra.");
}
