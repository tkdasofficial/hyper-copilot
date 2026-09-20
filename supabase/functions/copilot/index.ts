import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const PIXAZO_BASE = "https://gateway.pixazo.ai";
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

function getPixazoKey(): string {
  return (Deno.env.get("PIXAZO_API_KEY") ?? Deno.env.get("PIXAZO_KEY") ?? "").trim();
}

function getNvidiaKey(): string {
  return (
    Deno.env.get("NVIDIA_API_KEY") ??
    Deno.env.get("NVIDIA_KEY") ??
    Deno.env.get("NVIDIA_NIM_API_KEY") ??
    ""
  ).trim();
}

/** Sync keys into Postgres database if provider_secrets table is accessible */
async function syncSecretsToDb(pixazo: string, nvidia: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      if (pixazo) {
        await supabase.rpc("set_provider_secret", { p_name: "PIXAZO_API_KEY", p_value: pixazo });
      }
      if (nvidia) {
        await supabase.rpc("set_provider_secret", { p_name: "NVIDIA_API_KEY", p_value: nvidia });
      }
    }
  } catch (err) {
    console.warn("Could not sync secrets to DB:", err);
  }
}

/** 1. Text-To-Text: Nvidia (nemotron-3-ultra-550b-a55b) */
async function callNvidiaText(messages: Array<{ role: string; content: string }>) {
  const apiKey = getNvidiaKey();
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not configured in Supabase secrets.");
  }

  const modelsToTry = ["nvidia/nemotron-3-ultra-550b-a55b", "nemotron-3-ultra-550b-a55b"];

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
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
        const errText = await res.text();
        throw new Error(`NVIDIA Nemotron error (${res.status}): ${errText.slice(0, 300)}`);
      }

      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content ?? "";
      if (!reply) throw new Error("NVIDIA Nemotron returned an empty response.");
      return { text: reply, model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // If 404 or bad model name, try next model name
      if (!lastError.message.includes("404") && !lastError.message.includes("model")) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Failed to call Nvidia Nemotron 3 Ultra.");
}

/** 2. Text-To-Image: Pixazo (Flux 1 Schnell - FREE) */
async function callPixazoFluxSchnell(
  prompt: string,
  options?: { aspect?: string; width?: number; height?: number; steps?: number; seed?: number },
) {
  const apiKey = getPixazoKey();
  if (!apiKey) {
    throw new Error("PIXAZO_API_KEY is not configured in Supabase secrets.");
  }

  let width = options?.width ?? 1024;
  let height = options?.height ?? 1024;
  if (options?.aspect === "16:9") {
    width = 1280;
    height = 736;
  } else if (options?.aspect === "9:16") {
    width = 736;
    height = 1280;
  }

  const payload: Record<string, unknown> = {
    prompt,
    num_steps: Math.min(8, Math.max(4, options?.steps ?? 8)),
    width,
    height,
  };
  if (options?.seed !== undefined) payload.seed = options.seed;

  const res = await fetch(`${PIXAZO_BASE}/flux-1-schnell/v1/getData`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pixazo Flux Schnell error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { output?: string; imageUrl?: string };
  const imageUrl = data.output ?? data.imageUrl;
  if (!imageUrl) throw new Error("Pixazo Flux Schnell returned no image URL.");
  return { imageUrl };
}

/** 3. Image-To-Image: Pixazo (Stable Diffusion Inpainting - FREE) */
async function callPixazoSDInpainting(input: {
  prompt: string;
  imageUrl: string;
  maskUrl?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  strength?: number;
}) {
  const apiKey = getPixazoKey();
  if (!apiKey) {
    throw new Error("PIXAZO_API_KEY is not configured in Supabase secrets.");
  }

  const defaultNegative =
    "lowres, worst quality, low quality, jpeg artifacts, blurry, deformed, disfigured, bad anatomy, text, watermark";

  const payload = {
    prompt: input.prompt,
    imageUrl: input.imageUrl,
    ...(input.maskUrl ? { maskUrl: input.maskUrl } : {}),
    negative_prompt: [input.negativePrompt, defaultNegative].filter(Boolean).join(", "),
    width: input.width ?? 1024,
    height: input.height ?? 1024,
    num_steps: input.steps ?? 30,
    guidance: input.guidance ?? 7.5,
    ...(input.strength !== undefined ? { strength: input.strength } : {}),
  };

  const res = await fetch(`${PIXAZO_BASE}/inpainting/v1/getImage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pixazo SD Inpainting error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { imageUrl?: string; output?: string };
  const imageUrl = data.imageUrl ?? data.output;
  if (!imageUrl) throw new Error("Pixazo SD Inpainting returned no image URL.");
  return { imageUrl };
}

/** 4. Image-To-Video: Pixazo (LTX 2.5 - FREE) */
async function callPixazoStartVideo(input: {
  prompt: string;
  imageUrl?: string;
  aspect?: string;
  frames?: number;
  frameRate?: number;
}) {
  const apiKey = getPixazoKey();
  if (!apiKey) {
    throw new Error("PIXAZO_API_KEY is not configured in Supabase secrets.");
  }

  // Endpoints to try for LTX 2.5 Free Image-to-Video
  const endpoints = input.imageUrl
    ? ["/ltx-2-5-free/v1/image-to-video", "/ltx-video/v1/image-to-video"]
    : ["/ltx-2-5-free/v1/text-to-video", "/ltx-video/v1/text-to-video"];

  const baseBody = {
    prompt: input.prompt,
    ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
    aspect: input.aspect ?? "16:9",
    ...(input.frames ? { num_frames: input.frames } : {}),
    ...(input.frameRate ? { frame_rate: input.frameRate } : {}),
  };

  let lastError: Error | null = null;
  for (const path of endpoints) {
    try {
      const res = await fetch(`${PIXAZO_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Ocp-Apim-Subscription-Key": apiKey,
        },
        body: JSON.stringify(baseBody),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Pixazo LTX 2.5 error (${res.status}) on ${path}: ${text.slice(0, 250)}`);
      }

      const data = (await res.json()) as { request_id?: string; requestId?: string };
      const requestId = data.request_id ?? data.requestId;
      if (!requestId) throw new Error("Pixazo returned no request_id for video generation.");
      return { requestId };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // if 404 on ltx-2-5-free, fallback to ltx-video
      if (!lastError.message.includes("404")) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Failed to start LTX 2.5 video generation.");
}

/** Check video job status */
async function checkPixazoVideoStatus(requestId: string) {
  const apiKey = getPixazoKey();
  if (!apiKey) {
    throw new Error("PIXAZO_API_KEY is not configured in Supabase secrets.");
  }

  const res = await fetch(`${PIXAZO_BASE}/v2/requests/status/${requestId}`, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Video status check failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    status?: string;
    error?: string;
    output?: { media_url?: string[]; video_url?: string };
  };

  const status = (data.status ?? "PROCESSING").toUpperCase();
  const videoUrl = data.output?.media_url?.[0] ?? data.output?.video_url;

  return {
    status,
    videoUrl,
    error: data.error,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Health check & status query
  if (req.method === "GET") {
    const videoRequestId =
      url.searchParams.get("videoRequestId") || url.searchParams.get("requestId");
    if (videoRequestId) {
      try {
        const statusResult = await checkPixazoVideoStatus(videoRequestId);
        return new Response(JSON.stringify({ ok: true, ...statusResult }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const pixazoKey = getPixazoKey();
    const nvidiaKey = getNvidiaKey();
    return new Response(
      JSON.stringify({
        ok: true,
        hasPixazoKey: !!pixazoKey,
        hasNvidiaKey: !!nvidiaKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const pixazoKey = getPixazoKey();
    const nvidiaKey = getNvidiaKey();

    // Background sync secrets to DB
    syncSecretsToDb(pixazoKey, nvidiaKey).catch(() => {});

    // Action 1: Text-To-Text (Nvidia nemotron-3-ultra-550b-a55b)
    if (action === "text" || action === "chat") {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (
        body.prompt &&
        (!messages.length || messages[messages.length - 1].content !== body.prompt)
      ) {
        messages.push({ role: "user", content: body.prompt });
      }

      // Add system message if not present
      if (!messages.some((m: { role: string }) => m.role === "system")) {
        messages.unshift({
          role: "system",
          content:
            "You are Copilot, a brilliant AI creative partner powering content generation, scriptwriting, campaign planning, and multimodal storytelling. Provide clear, well-structured, insightful responses.",
        });
      }

      const result = await callNvidiaText(messages);
      return new Response(JSON.stringify({ ok: true, type: "text", ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 2: Text-To-Image (Pixazo Flux 1 Schnell - FREE)
    if (action === "text-to-image" || action === "image") {
      const prompt = (body.prompt ?? "").trim();
      if (!prompt) throw new Error("Missing prompt for image generation.");

      const result = await callPixazoFluxSchnell(prompt, {
        aspect: body.aspect,
        width: body.width,
        height: body.height,
        steps: body.steps,
        seed: body.seed,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          type: "image",
          model: "Pixazo Flux 1 Schnell (Free)",
          imageUrl: result.imageUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Action 3: Image-To-Image (Pixazo Stable Diffusion Inpainting - FREE)
    if (action === "image-to-image" || action === "inpainting") {
      const prompt = (body.prompt ?? "").trim();
      const imageUrl = (body.imageUrl ?? body.referenceUrl ?? "").trim();
      if (!imageUrl) throw new Error("Missing source image URL for Image-To-Image.");

      const result = await callPixazoSDInpainting({
        prompt,
        imageUrl,
        maskUrl: body.maskUrl,
        negativePrompt: body.negativePrompt,
        width: body.width,
        height: body.height,
        steps: body.steps,
        guidance: body.guidance,
        strength: body.strength,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          type: "image",
          model: "Pixazo Stable Diffusion Inpainting (Free)",
          imageUrl: result.imageUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Action 4: Image-To-Video (Pixazo LTX 2.5 - FREE)
    if (action === "image-to-video" || action === "video") {
      const prompt = (body.prompt ?? "").trim();
      const imageUrl = (body.imageUrl ?? body.referenceUrl ?? "").trim();

      const startResult = await callPixazoStartVideo({
        prompt,
        imageUrl: imageUrl || undefined,
        aspect: body.aspect,
        frames: body.frames,
        frameRate: body.frameRate,
      });

      // Optionally wait/poll a few times if requested
      if (body.wait) {
        const maxWaitMs = 50_000;
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
          await new Promise((r) => setTimeout(r, 4000));
          const status = await checkPixazoVideoStatus(startResult.requestId);
          if (status.status === "COMPLETED" && status.videoUrl) {
            return new Response(
              JSON.stringify({
                ok: true,
                type: "video",
                model: "Pixazo LTX 2.5 (Free)",
                status: "COMPLETED",
                requestId: startResult.requestId,
                videoUrl: status.videoUrl,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (status.status === "FAILED" || status.status === "ERROR") {
            throw new Error(status.error || "Video generation failed.");
          }
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          type: "video",
          model: "Pixazo LTX 2.5 (Free)",
          status: "PROCESSING",
          requestId: startResult.requestId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Action 5: Check Video Status
    if (action === "check-video") {
      const requestId = body.requestId;
      if (!requestId) throw new Error("Missing requestId for video status check.");
      const statusResult = await checkPixazoVideoStatus(requestId);
      return new Response(JSON.stringify({ ok: true, ...statusResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(
      `Unknown action: '${action}'. Expected text, text-to-image, image-to-image, image-to-video, or check-video.`,
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
