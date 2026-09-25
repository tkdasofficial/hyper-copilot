import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const PIXAZO_BASE = "https://gateway.pixazo.ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Aspect ratio label -> pixel dimensions rounded to multiples of 32 */
function sizeForAspect(aspect: string, base = 1024): { width: number; height: number } {
  const [wRaw, hRaw] = (aspect || "1:1").split(":").map((n) => Number(n));
  const w = Number.isFinite(wRaw) && wRaw ? wRaw : 1;
  const h = Number.isFinite(hRaw) && hRaw ? hRaw : 1;
  const scale = base / Math.sqrt(w * h);
  const round = (v: number) => Math.max(256, Math.min(1536, Math.round((v * scale) / 32) * 32));
  return { width: round(w), height: round(h) };
}

// --- Backend-only access guard (added by Lovable) ---
async function assertBackendCaller(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const token = (
    req.headers.get("x-worker-secret") ??
    url.searchParams.get("worker_secret") ??
    ""
  ).trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  if (serviceKey && auth && auth === serviceKey) return null;

  if (token) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (supabaseUrl && serviceKey) {
      try {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data } = await admin.rpc("verify_worker_token", { p_token: token });
        if (data === true) return null;
      } catch (_e) {
        // fall through to reject
      }
    }
  }

  return new Response(JSON.stringify({ error: "Forbidden: backend-only endpoint." }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
// --- end guard ---

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __denied = await assertBackendCaller(req);
  if (__denied) return __denied;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing required 'prompt' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aspect = body.aspect || "1:1";
    const resolutionBase =
      body.resolution === "1K"
        ? 896
        : body.resolution === "4K"
          ? 1280
          : body.resolution === "8K"
            ? 1408
            : 1024;
    const { width, height } = sizeForAspect(aspect, resolutionBase);

    // Pixazo API Key resolution: from env or supabase vault secret
    let pixazoKey = Deno.env.get("PIXAZO_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!pixazoKey && supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data } = await supabase.rpc("get_provider_secret", { p_name: "PIXAZO_API_KEY" });
      if (typeof data === "string" && data.trim()) {
        pixazoKey = data.trim();
      }
    }

    if (!pixazoKey) {
      throw new Error("PIXAZO_API_KEY is not configured in environment or vault.");
    }

    const refImage = body.imageUrl || body.image_url || (Array.isArray(body.referenceUrls) ? body.referenceUrls[0] : undefined);
    const isImg2Img = Boolean(refImage) || body.model === "stable-diffusion-v1-5";

    let imageUrl: string | undefined;
    let modelName = "flux-1-schnell";

    if (isImg2Img && refImage) {
      // Image to Image: Stable Diffusion v1-5 on Pixazo
      modelName = "stable-diffusion-v1-5";
      const payload: Record<string, unknown> = {
        prompt,
        imageUrl: refImage,
        negative_prompt: body.negativePrompt || body.negative || "blurry, low quality, distorted",
        width: Number(body.width) || width,
        height: Number(body.height) || height,
        num_steps: Math.min(50, Math.max(20, Number(body.steps) || 30)),
        guidance: Number(body.guidance) || 7.5,
        strength: body.strength !== undefined ? Number(body.strength) : 0.65,
      };
      if (body.seed !== undefined) payload.seed = Number(body.seed);

      const sdRes = await fetch(`${PIXAZO_BASE}/inpainting/v1/getImage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Ocp-Apim-Subscription-Key": pixazoKey,
        },
        body: JSON.stringify(payload),
      });

      const sdText = await sdRes.text();
      if (!sdRes.ok) {
        throw new Error(`Stable Diffusion v1.5 error [${sdRes.status}]: ${sdText.slice(0, 300)}`);
      }

      const sdData = JSON.parse(sdText) as { output?: string; imageUrl?: string };
      imageUrl = sdData.imageUrl ?? sdData.output;
    } else {
      // Text to Image: Flux.1 Schnell - FREE on Pixazo
      modelName = "flux-1-schnell";
      const steps = Math.min(8, Math.max(4, Number(body.steps) || 8));
      const payload: Record<string, unknown> = {
        prompt,
        num_steps: steps,
        width: Number(body.width) || width,
        height: Number(body.height) || height,
      };
      if (body.seed !== undefined) payload.seed = Number(body.seed);

      const pixazoRes = await fetch(`${PIXAZO_BASE}/flux-1-schnell/v1/getData`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Ocp-Apim-Subscription-Key": pixazoKey,
        },
        body: JSON.stringify(payload),
      });

      const resText = await pixazoRes.text();
      if (!pixazoRes.ok) {
        throw new Error(`Flux Schnell error [${pixazoRes.status}]: ${resText.slice(0, 300)}`);
      }

      const data = JSON.parse(resText) as { output?: string; imageUrl?: string };
      imageUrl = data.output ?? data.imageUrl;
    }

    if (!imageUrl) {
      throw new Error(`${modelName} provider returned no image URL`);
    }

    // Optional: Return base64 if requested
    let base64: string | undefined;
    if (body.format === "base64" || body.return_base64) {
      const imgFetch = await fetch(imageUrl);
      if (imgFetch.ok) {
        const buf = await imgFetch.arrayBuffer();
        base64 = `data:${imgFetch.headers.get("content-type") || "image/png"};base64,${btoa(
          String.fromCharCode(...new Uint8Array(buf)),
        )}`;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        model: modelName,
        url: imageUrl,
        ...(base64 ? { base64 } : {}),
        width,
        height,
        aspect,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
