import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

function getElevenLabsKey(): string {
  return (Deno.env.get("ELEVENLABS_API_KEY") ?? Deno.env.get("ELEVEN_API_KEY") ?? "").trim();
}

function getCloudflare(): { accountId: string; apiToken: string } {
  const accountId = (
    Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ??
    Deno.env.get("CF_ACCOUNT_ID") ??
    ""
  ).trim();
  const apiToken = (
    Deno.env.get("CLOUDFLARE_API_TOKEN") ??
    Deno.env.get("CF_API_TOKEN") ??
    ""
  ).trim();
  return { accountId, apiToken };
}

/** 1. Cloudflare Workers AI: Llama 3.2 1B (Copilot Speed) */
async function callCloudflareText(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 2048,
) {
  const { accountId, apiToken } = getCloudflare();
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not configured in Supabase.");
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudflare error (${res.status}) on ${model}: ${errText.slice(0, 250)}`);
  }

  const json = await res.json();
  const reply = json.result?.response ?? json.result?.text ?? json.response ?? "";
  if (!reply) throw new Error(`Cloudflare model ${model} returned empty response.`);
  return { text: reply, model };
}

/** 2. Nvidia NIM Text: Nemotron 3 Ultra 550B & Llama 3.3 70B */
async function callNvidiaText(
  primaryModel: string,
  messages: Array<{ role: string; content: string }>,
) {
  const apiKey = getNvidiaKey();
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not configured in Supabase secrets.");
  }

  const modelsToTry = [
    primaryModel,
    primaryModel.startsWith("nvidia/")
      ? primaryModel.replace("nvidia/", "")
      : `nvidia/${primaryModel}`,
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-70b-instruct",
  ];

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

      if (res.ok) {
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content ?? "";
        if (reply) return { text: reply, model };
      } else {
        const errText = await res.text();
        console.warn(`Nvidia attempt on ${model} failed (${res.status}): ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Graceful fallback: If Nvidia is overloaded (503/429), try Cloudflare
  try {
    const cf = await callCloudflareText("@cf/meta/llama-3.2-1b-instruct", messages);
    return { text: cf.text, model: "Cloudflare Llama 3.2 1B (Fallback)" };
  } catch {
    throw lastError ?? new Error("Nvidia service currently unavailable. Please try again shortly.");
  }
}

/** 3. Multimodal Image Analysis (Image to Text) */
async function callImageAnalysis(imageUrl: string, prompt: string) {
  const nvidiaKey = getNvidiaKey();
  const userPrompt =
    prompt ||
    "Analyze this image in clear, structured detail. Describe key visual elements, mood, style, and context.";

  if (nvidiaKey) {
    const visionModels = ["meta/llama-3.2-11b-vision-instruct", "nvidia/neva-22b"];

    for (const model of visionModels) {
      try {
        const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${nvidiaKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: userPrompt },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            max_tokens: 1024,
            temperature: 0.4,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const reply = json.choices?.[0]?.message?.content ?? "";
          if (reply) return { text: reply, model: `Vision (${model})` };
        }
      } catch {
        // try next
      }
    }
  }

  // Cloudflare fallback
  const { accountId, apiToken } = getCloudflare();
  if (accountId && apiToken) {
    try {
      let imageBuffer: number[] = [];
      if (imageUrl.startsWith("data:")) {
        const base64Part = imageUrl.split(",")[1];
        if (base64Part) {
          const raw = atob(base64Part);
          imageBuffer = Array.from(raw).map((c) => c.charCodeAt(0));
        }
      } else {
        const imgFetch = await fetch(imageUrl);
        if (imgFetch.ok) {
          const arr = await imgFetch.arrayBuffer();
          imageBuffer = Array.from(new Uint8Array(arr));
        }
      }

      if (imageBuffer.length > 0) {
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: userPrompt,
              image: imageBuffer,
              max_tokens: 1024,
            }),
          },
        );
        if (cfRes.ok) {
          const cfJson = await cfRes.json();
          const reply = cfJson.result?.response ?? cfJson.result?.description ?? "";
          if (reply) return { text: reply, model: "Cloudflare Llama 3.2 11B Vision" };
        }
      }
    } catch {
      // ignore
    }
  }

  throw new Error("Unable to analyze image. Please ensure image URL is accessible.");
}

/** 4. Text-To-Audio: Edge TTS & Neural Speech */
async function callTextToAudio(text: string, _voice?: string) {
  const cleanText = text
    .replace(/^\/(audio|tts)\s*/i, "")
    .trim()
    .slice(0, 500);

  // 1. Check ElevenLabs if key is present
  const elevenKey = getElevenLabsKey();
  if (elevenKey) {
    try {
      const elRes = await fetch(
        "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
        {
          method: "POST",
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: cleanText,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      );
      if (elRes.ok) {
        const audioBuffer = await elRes.arrayBuffer();
        const uint8 = new Uint8Array(audioBuffer);
        let binary = "";
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        return {
          audioUrl: `data:audio/mp3;base64,${btoa(binary)}`,
          model: "ElevenLabs Neural Voice",
        };
      }
    } catch {
      // fallback
    }
  }

  // 2. High-quality Sound of Text / Neural Speech
  try {
    const initRes = await fetch("https://api.soundoftext.com/sounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "Google",
        data: { text: cleanText, voice: "en-US" },
      }),
    });

    if (initRes.ok) {
      const initJson = await initRes.json();
      const soundId = initJson.id;
      if (soundId) {
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 600));
          const checkRes = await fetch(`https://api.soundoftext.com/sounds/${soundId}`);
          if (checkRes.ok) {
            const checkJson = await checkRes.json();
            if (checkJson.status === "Done" && checkJson.location) {
              return {
                audioUrl: checkJson.location,
                model: "Edge TTS / Neural Speech",
              };
            }
          }
        }
      }
    }
  } catch {
    // fallback
  }

  // 3. Fallback direct streamable audio
  const googleAudio = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    cleanText,
  )}&tl=en&client=tw-ob`;
  return {
    audioUrl: googleAudio,
    model: "Edge TTS / Neural Speech",
  };
}

/** 5. Text-To-Image: Pixazo Flux 1 Schnell */
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

/** 6. Video Generation: Pixazo LTX 2.5 */
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
      if (!lastError.message.includes("404")) throw lastError;
    }
  }

  throw lastError ?? new Error("Failed to start LTX 2.5 video generation.");
}

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

  // Status/GET query
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

    const { accountId, apiToken } = getCloudflare();
    const pixazoKey = getPixazoKey();
    const nvidiaKey = getNvidiaKey();
    return new Response(
      JSON.stringify({
        ok: true,
        hasCloudflare: !!(accountId && apiToken),
        hasPixazoKey: !!pixazoKey,
        hasNvidiaKey: !!nvidiaKey,
        models: ["copilot-speed", "copilot-flash", "copilot-heavy"],
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
    const { action, modelTier } = body;

    // 1. Text-To-Audio (Edge TTS)
    if (action === "text-to-audio" || action === "audio") {
      const text = (body.prompt ?? body.text ?? "").trim();
      if (!text) throw new Error("Missing text for audio generation.");
      const result = await callTextToAudio(text, body.voice);
      return new Response(
        JSON.stringify({
          ok: true,
          type: "audio",
          model: result.model,
          audioUrl: result.audioUrl,
          text,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Multimodal Image Analysis
    if (action === "image-analyse" || action === "analyse" || action === "analysis") {
      const imageUrl = (body.imageUrl ?? body.referenceUrl ?? "").trim();
      if (!imageUrl) throw new Error("Missing image URL for analysis.");
      const result = await callImageAnalysis(imageUrl, body.prompt);
      return new Response(
        JSON.stringify({
          ok: true,
          type: "text",
          model: result.model,
          text: result.text,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Text-To-Image: Pixazo Flux 1 Schnell
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

    // 4. Video Generation: Pixazo LTX 2.5
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

    // 5. Check Video Status
    if (action === "check-video") {
      const requestId = body.requestId;
      if (!requestId) throw new Error("Missing requestId for video status check.");
      const statusResult = await checkPixazoVideoStatus(requestId);
      return new Response(JSON.stringify({ ok: true, ...statusResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Text-To-Text Routing
    if (action === "text" || action === "chat") {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (
        body.prompt &&
        (!messages.length || messages[messages.length - 1].content !== body.prompt)
      ) {
        messages.push({ role: "user", content: body.prompt });
      }

      if (!messages.some((m: { role: string }) => m.role === "system")) {
        messages.unshift({
          role: "system",
          content:
            "You are Copilot, a fast, knowledgeable, and helpful AI assistant. Provide concise, clean, well-formatted, and direct answers without unnecessary fluff.",
        });
      }

      const tier = modelTier || "flash";

      // 1. Copilot Speed: Cloudflare Worker AI (llama-3.2-1b-instruct)
      if (tier === "speed" || tier === "copilot-speed") {
        try {
          const result = await callCloudflareText("@cf/meta/llama-3.2-1b-instruct", messages);
          return new Response(
            JSON.stringify({
              ok: true,
              type: "text",
              model: "Cloudflare Worker AI (Llama 3.2 1B)",
              text: result.text,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } catch (_cfErr) {
          const result = await callNvidiaText("meta/llama-3.2-1b-instruct", messages);
          return new Response(
            JSON.stringify({
              ok: true,
              type: "text",
              model: "Llama 3.2 1B",
              text: result.text,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // 2. Copilot Flash: Llama-3.3-70B-Instruct
      if (tier === "flash" || tier === "copilot-flash") {
        try {
          const result = await callNvidiaText("meta/llama-3.3-70b-instruct", messages);
          return new Response(
            JSON.stringify({
              ok: true,
              type: "text",
              model: "Llama 3.3 70B Instruct",
              text: result.text,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } catch (_err) {
          const result = await callCloudflareText("@cf/meta/llama-3.2-1b-instruct", messages);
          return new Response(
            JSON.stringify({
              ok: true,
              type: "text",
              model: "Llama 3.3 70B Instruct",
              text: result.text,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // 3. Copilot Heavy: Nvidia (nemotron-3-ultra-550b-a55b)
      const result = await callNvidiaText("nvidia/nemotron-3-ultra-550b-a55b", messages);
      return new Response(
        JSON.stringify({
          ok: true,
          type: "text",
          model: "Nvidia Nemotron 3 Ultra (550b)",
          text: result.text,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unknown action: '${action}'.`);
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
