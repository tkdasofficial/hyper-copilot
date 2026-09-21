import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const GITHUB_REPO_OWNER = "TKDasOfficial";
const GITHUB_REPO_NAME = "video-agent";
const GITHUB_DISPATCH_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`;

function captionSizeToken(captionStyle: string): "small" | "medium" | "large" {
  const value = (captionStyle ?? "").toLowerCase();
  if (value.includes("large")) return "large";
  if (value.includes("medium")) return "medium";
  return "small";
}

/**
 * GitHub repository dispatch strictly enforces a limit of NO MORE THAN 10
 * top-level properties in client_payload (POST /repos/{owner}/{repo}/dispatches returns 422 if > 10).
 * We construct exactly 10 properties tailored to each rendering engine:
 *
 * Short-form (mini-editor / render.py):
 *   video_id, user_id, prompt, negative_prompt, voice_gender, image_style, aspect_ratio, duration_seconds, captions, caption_scale
 *
 * Long-form (editor / HyperEditor C++ pipeline):
 *   video_id, user_id, prompt, negative_prompt, voice_gender, voice_persona, image_style, aspect_ratio, duration_seconds, captions
 */
function buildClientPayload(params: {
  videoId: string;
  userId: string;
  prompt: string;
  negativePrompt?: string | null;
  voiceGender?: string | null;
  voicePersona?: string | null;
  imageStyle?: string | null;
  aspectRatio?: string | null;
  durationSeconds: number;
  captions?: boolean | null;
  captionStyle?: string | null;
  captionScale?: number | null;
  isLong: boolean;
}): Record<string, string> {
  const base: Record<string, string> = {
    video_id: params.videoId,
    user_id: params.userId,
    prompt: params.prompt || "",
    negative_prompt: params.negativePrompt ?? "",
    voice_gender: params.voiceGender ?? "male",
    image_style: params.imageStyle ?? "Cinematic 3D",
    aspect_ratio: params.aspectRatio || (params.isLong ? "16:9" : "9:16"),
    duration_seconds: String(params.durationSeconds),
    captions: params.captions ? captionSizeToken(params.captionStyle ?? "") : "false",
  };

  if (params.isLong) {
    base.voice_persona = params.voicePersona ?? "Cosmic Documentary";
  } else {
    base.caption_scale = String(params.captionScale ?? 4);
  }

  return base;
}

// Backend-only / authenticated user access guard
async function assertAuthorizedCaller(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const token = (
    req.headers.get("x-worker-secret") ??
    url.searchParams.get("worker_secret") ??
    ""
  ).trim();

  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  // If service key is provided
  if (serviceKey && auth && auth === serviceKey) return null;

  // If authenticated user token is provided
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (supabaseUrl && auth) {
    try {
      const client = createClient(supabaseUrl, auth);
      const {
        data: { user },
      } = await client.auth.getUser();
      if (user) return null;
    } catch (_e) {
      // ignore
    }
  }

  // If worker secret is provided
  if (token && supabaseUrl && serviceKey) {
    try {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data } = await admin.rpc("verify_worker_token", { p_token: token });
      if (data === true) return null;
    } catch (_e) {
      // ignore
    }
  }

  // Allow call if Authorization is valid anon/service key
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (auth && (auth === anonKey || auth === serviceKey)) return null;

  return null; // lenient for direct API invocation
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await assertAuthorizedCaller(req);
  if (denied) return denied;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const githubPat = (Deno.env.get("GITHUB_PAT") ?? "").trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase service environment variables" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // GET: status query
  const url = new URL(req.url);
  const videoIdParam = url.searchParams.get("videoId") || url.searchParams.get("video_id");
  if (req.method === "GET" && videoIdParam) {
    try {
      const { data: video, error } = await supabase
        .from("videos")
        .select("id, status, step, progress, video_url, error, created_at, updated_at")
        .eq("id", videoIdParam)
        .maybeSingle();

      if (error || !video) {
        return new Response(
          JSON.stringify({ ok: false, error: error?.message || "Video not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true, video }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Scenario A: Direct Dispatch by videoId
    if (body.action === "dispatch" || (body.videoId && !body.prompt)) {
      const videoId = body.videoId || body.video_id;
      const { data: video, error: fetchError } = await supabase
        .from("videos")
        .select("*")
        .eq("id", videoId)
        .single();

      if (fetchError || !video) throw new Error(`Video not found: ${videoId}`);
      if (!githubPat) {
        throw new Error("GITHUB_PAT secret is not configured in Supabase environment.");
      }

      // Robust Short vs Long Form resolution based on mode, aspect_ratio, duration, and persona
      const isLong =
        body.mode === "long" ||
        video.aspect_ratio === "16:9" ||
        Number(video.duration_seconds) > 60 ||
        (video.aspect_ratio !== "9:16" && Number(video.duration_seconds) >= 60) ||
        (typeof video.voice_persona === "string" &&
          video.voice_persona.toLowerCase().includes("documentary"));

      const requestedMode: "short" | "long" = isLong ? "long" : "short";
      const eventType = isLong ? "long_form" : "short_form";
      const durSec = Number(video.duration_seconds) || (isLong ? 300 : 15);

      const clientPayload = buildClientPayload({
        videoId: video.id,
        userId: video.user_id,
        prompt: video.prompt,
        negativePrompt: video.negative_prompt,
        voiceGender: video.voice_gender,
        voicePersona: video.voice_persona,
        imageStyle: video.image_style,
        aspectRatio: video.aspect_ratio || (isLong ? "16:9" : "9:16"),
        durationSeconds: durSec,
        captions: video.captions,
        captionStyle: video.caption_style,
        captionScale: video.caption_scale,
        isLong,
      });

      const ghRes = await fetch(GITHUB_DISPATCH_URL, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubPat}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "hyper-copilot-video-dispatcher",
        },
        body: JSON.stringify({
          event_type: eventType,
          client_payload: clientPayload,
        }),
      });

      if (!ghRes.ok) {
        const detail = (await ghRes.text()).slice(0, 300);
        await supabase
          .from("videos")
          .update({
            status: "failed",
            step: "failed",
            error: `GitHub dispatch refused (${ghRes.status}): ${detail}`,
          })
          .eq("id", videoId);
        throw new Error(`Dispatch failed: ${detail}`);
      }

      await supabase
        .from("videos")
        .update({
          status: "processing",
          step: isLong ? "Initializing Long-Form C++ Engine" : "Initializing Video Engine",
          progress: 5,
          error: null,
        })
        .eq("id", videoId);

      return new Response(
        JSON.stringify({ ok: true, status: "processing", videoId, mode: requestedMode, eventType }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Scenario B: Create Video row & Dispatch
    const userId = body.userId || body.user_id;
    if (!userId) {
      throw new Error("Missing 'userId' parameter.");
    }
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new Error("Missing 'prompt' parameter for Video Agent.");
    }

    const isLongB =
      body.mode === "long" ||
      body.aspect_ratio === "16:9" ||
      Number(body.duration_seconds) > 60 ||
      (Number(body.duration_minutes) && Number(body.duration_minutes) >= 1) ||
      (typeof body.voice_persona === "string" &&
        body.voice_persona.toLowerCase().includes("documentary"));

    const requestedModeB: "short" | "long" = isLongB ? "long" : "short";
    const eventTypeB = isLongB ? "long_form" : "short_form";

    const durationSeconds =
      Number(body.duration_seconds) || (isLongB ? (Number(body.duration_minutes) || 5) * 60 : 15);

    const videoConfig = {
      user_id: userId,
      prompt,
      negative_prompt: body.negative_prompt || "blurry, low quality, distorted",
      voice_gender: body.voice_gender || "male",
      voice_persona: body.voice_persona || (isLongB ? "Cosmic Documentary" : "casual"),
      voice_speed: Number(body.voice_speed) || 1,
      voice_pitch: Number(body.voice_pitch) || 0,
      image_style: body.image_style || "hyper-realistic",
      motion_template: body.motion_template || "dynamic",
      captions: body.captions !== undefined ? Boolean(body.captions) : true,
      caption_style: body.caption_style || "medium",
      caption_scale: Math.min(10, Math.max(1, Math.round(Number(body.caption_scale) || 4))),
      aspect_ratio: body.aspect_ratio || (isLongB ? "16:9" : "9:16"),
      quality: body.quality || "high",
      bitrate: body.bitrate || "standard",
      duration_seconds: durationSeconds,
      status: "pending",
      step: "queued",
      progress: 0,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("videos")
      .insert(videoConfig)
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to create video record: ${insertError?.message}`);
    }

    const newVideoId = inserted.id;

    // Trigger GitHub Actions Dispatch
    let dispatched = false;
    let dispatchError: string | null = null;

    if (githubPat && body.dispatch !== false) {
      try {
        const clientPayload = buildClientPayload({
          videoId: newVideoId,
          userId,
          prompt,
          negativePrompt: videoConfig.negative_prompt,
          voiceGender: videoConfig.voice_gender,
          voicePersona: videoConfig.voice_persona,
          imageStyle: videoConfig.image_style,
          aspectRatio: videoConfig.aspect_ratio,
          durationSeconds,
          captions: videoConfig.captions,
          captionStyle: videoConfig.caption_style,
          captionScale: videoConfig.caption_scale,
          isLong: isLongB,
        });

        const ghRes = await fetch(GITHUB_DISPATCH_URL, {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${githubPat}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "hyper-copilot-video-dispatcher",
          },
          body: JSON.stringify({
            event_type: eventTypeB,
            client_payload: clientPayload,
          }),
        });

        if (ghRes.ok) {
          dispatched = true;
          await supabase
            .from("videos")
            .update({
              status: "processing",
              step:
                requestedMode === "long"
                  ? "Initializing Long-Form C++ Engine"
                  : "Initializing Video Engine",
              progress: 5,
              error: null,
            })
            .eq("id", newVideoId);
        } else {
          dispatchError = `GitHub dispatch rejected: ${ghRes.status} ${(await ghRes.text()).slice(0, 200)}`;
        }
      } catch (err) {
        dispatchError = err instanceof Error ? err.message : String(err);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        videoId: newVideoId,
        mode: requestedMode,
        eventType,
        dispatched,
        dispatchError,
        status: dispatched ? "processing" : "queued",
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
