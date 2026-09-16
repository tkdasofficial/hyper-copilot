import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const PIXAZO_BASE = "https://gateway.pixazo.ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/** Pixel sizes standard for video aspects */
function videoSize(aspect = "16:9", resolution = "720p"): { width: number; height: number } {
  if (aspect === "9:16") {
    return resolution === "1080p" ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
  }
  if (aspect === "1:1") {
    return resolution === "1080p" ? { width: 1080, height: 1080 } : { width: 720, height: 720 };
  }
  return resolution === "1080p" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
}


// --- Backend-only access guard (added by Lovable) ---
async function assertBackendCaller(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const token = (req.headers.get("x-worker-secret") ?? url.searchParams.get("worker_secret") ?? "").trim();
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

  // GET: Check job status if requestId is provided in search params
  const url = new URL(req.url);
  const requestIdParam = url.searchParams.get("requestId") || url.searchParams.get("request_id");

  if (req.method === "GET" && requestIdParam) {
    try {
      if (!pixazoKey) throw new Error("PIXAZO_API_KEY is not configured.");
      const statusRes = await fetch(`${PIXAZO_BASE}/v2/requests/status/${requestIdParam}`, {
        headers: { "Ocp-Apim-Subscription-Key": pixazoKey },
      });
      const text = await statusRes.text();
      if (!statusRes.ok) throw new Error(`Video status check failed (${statusRes.status}): ${text}`);
      const data = JSON.parse(text) as {
        status?: string;
        error?: string;
        output?: { media_url?: string[] };
      };
      const status = (data.status ?? "PROCESSING").toUpperCase();
      return new Response(
        JSON.stringify({
          ok: true,
          status,
          url: data.output?.media_url?.[0] ?? null,
          error: data.error ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // Check if client is polling via POST
    if (body.action === "status" || body.requestId || body.request_id) {
      const checkId = body.requestId || body.request_id;
      if (!pixazoKey) throw new Error("PIXAZO_API_KEY is not configured.");
      const statusRes = await fetch(`${PIXAZO_BASE}/v2/requests/status/${checkId}`, {
        headers: { "Ocp-Apim-Subscription-Key": pixazoKey },
      });
      const text = await statusRes.text();
      if (!statusRes.ok) throw new Error(`Video status check failed (${statusRes.status}): ${text}`);
      const data = JSON.parse(text) as {
        status?: string;
        error?: string;
        output?: { media_url?: string[] };
      };
      const status = (data.status ?? "PROCESSING").toUpperCase();
      return new Response(
        JSON.stringify({
          ok: true,
          requestId: checkId,
          status,
          url: data.output?.media_url?.[0] ?? null,
          error: data.error ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // New 5-second video clip generation (Text-to-Video or Image-to-Video)
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const imageUrl = body.imageUrl || body.image_url || undefined;
    const endImageUrl = body.endImageUrl || body.end_image_url || undefined;
    const aspect = body.aspect || "16:9";
    const resolution = body.resolution || "720p";
    const { width, height } = videoSize(aspect, resolution);

    // 5 seconds standard is ~121-125 frames at 24-25 fps
    const frames = Number(body.frames) || 121;
    const frameRate = Number(body.frameRate || body.frame_rate) || 24;

    const path = imageUrl ? "/ltx-video/v1/image-to-video" : "/ltx-video/v1/text-to-video";
    const apiPayload: Record<string, unknown> = {
      prompt,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(endImageUrl ? { end_image_url: endImageUrl } : {}),
      ...(body.negative ? { negative: body.negative } : {}),
      aspect,
      num_frames: frames,
      frame_rate: frameRate,
      width,
      height,
      ...(body.seed !== undefined ? { seed: Number(body.seed) } : {}),
    };

    if (!pixazoKey) throw new Error("PIXAZO_API_KEY is not configured.");

    const pixazoRes = await fetch(`${PIXAZO_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Ocp-Apim-Subscription-Key": pixazoKey,
      },
      body: JSON.stringify(apiPayload),
    });

    const resText = await pixazoRes.text();
    if (!pixazoRes.ok) {
      throw new Error(`Video generation request failed [${pixazoRes.status}]: ${resText.slice(0, 300)}`);
    }

    const resData = JSON.parse(resText) as { request_id?: string };
    if (!resData.request_id) {
      throw new Error("Video provider did not return a valid request_id.");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        model: "ltx-video-5s",
        requestId: resData.request_id,
        status: "PROCESSING",
        duration: "5s",
        frames,
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
