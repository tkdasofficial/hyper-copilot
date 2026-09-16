import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const GITHUB_REPO_OWNER = "TKDasOfficial";
const GITHUB_REPO_NAME = "video-agent";
const GITHUB_DISPATCH_EVENT = "video_agent_render";
const GITHUB_DISPATCH_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`;

function captionSizeToken(captionStyle: string): "small" | "medium" | "large" {
  const value = (captionStyle ?? "").toLowerCase();
  if (value.includes("large")) return "large";
  if (value.includes("medium")) return "medium";
  return "small";
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const githubPat = (Deno.env.get("GITHUB_PAT") ?? "").trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase service environment variables" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // GET: poll video status by video_id
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
        return new Response(JSON.stringify({ ok: false, error: error?.message || "Video not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    // Mode 1: Direct dispatch for an existing video row
    if (body.action === "dispatch" || (body.videoId && !body.prompt)) {
      const videoId = body.videoId || body.video_id;
      const { data: video, error: fetchError } = await supabase
        .from("videos")
        .select("*")
        .eq("id", videoId)
        .single();

      if (fetchError || !video) throw new Error(`Video not found: ${videoId}`);
      if (!githubPat) throw new Error("GITHUB_PAT secret is not configured in Supabase environment.");

      // Dispatch to GitHub Video Engine
      const res = await fetch(GITHUB_DISPATCH_URL, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubPat}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "hyper-copilot-video-agent-edge",
        },
        body: JSON.stringify({
          event_type: GITHUB_DISPATCH_EVENT,
          client_payload: {
            video_id: video.id,
            user_id: video.user_id,
            prompt: video.prompt,
            negative_prompt: video.negative_prompt,
            voice_gender: video.voice_gender,
            image_style: video.image_style,
            aspect_ratio: video.aspect_ratio,
            duration_seconds: String(video.duration_seconds),
            captions: video.captions ? captionSizeToken(video.caption_style) : "false",
            caption_scale: String(video.caption_scale ?? 4),
          },
        }),
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        await supabase
          .from("videos")
          .update({ status: "failed", step: "failed", error: `GitHub dispatch refused (${res.status}): ${detail}` })
          .eq("id", videoId);
        throw new Error(`Dispatch failed: ${detail}`);
      }

      await supabase
        .from("videos")
        .update({ status: "processing", step: "Initializing Video Engine" })
        .eq("id", videoId);

      return new Response(JSON.stringify({ ok: true, status: "processing", videoId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 2: Create new Video Agent task and optionally dispatch
    const userId = body.userId || body.user_id;
    if (!userId) {
      throw new Error("Missing 'userId' parameter.");
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new Error("Missing 'prompt' parameter for Video Agent.");
    }

    const videoConfig = {
      user_id: userId,
      prompt,
      negative_prompt: body.negative_prompt || "blurry, low quality, distorted",
      voice_gender: body.voice_gender || "male",
      voice_persona: body.voice_persona || "casual",
      voice_speed: Number(body.voice_speed) || 1,
      voice_pitch: Number(body.voice_pitch) || 0,
      image_style: body.image_style || "hyper-realistic",
      motion_template: body.motion_template || "dynamic",
      captions: body.captions !== undefined ? Boolean(body.captions) : true,
      caption_style: body.caption_style || "medium",
      caption_scale: Math.min(10, Math.max(1, Math.round(Number(body.caption_scale) || 4))),
      aspect_ratio: body.aspect_ratio || "9:16",
      quality: body.quality || "high",
      bitrate: body.bitrate || "standard",
      duration_seconds: Number(body.duration_seconds) || 15,
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

    // Asynchronous dispatch if GITHUB_PAT is ready
    let dispatched = false;
    if (githubPat && body.dispatch !== false) {
      try {
        const ghRes = await fetch(GITHUB_DISPATCH_URL, {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${githubPat}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "hyper-copilot-video-agent-edge",
          },
          body: JSON.stringify({
            event_type: GITHUB_DISPATCH_EVENT,
            client_payload: {
              video_id: newVideoId,
              user_id: userId,
              prompt: videoConfig.prompt,
              negative_prompt: videoConfig.negative_prompt,
              voice_gender: videoConfig.voice_gender,
              image_style: videoConfig.image_style,
              aspect_ratio: videoConfig.aspect_ratio,
              duration_seconds: String(videoConfig.duration_seconds),
              captions: videoConfig.captions ? captionSizeToken(videoConfig.caption_style) : "false",
              caption_scale: String(videoConfig.caption_scale ?? 4),
            },
          }),
        });

        if (ghRes.ok) {
          await supabase
            .from("videos")
            .update({ status: "processing", step: "Initializing Video Engine" })
            .eq("id", newVideoId);
          dispatched = true;
        }
      } catch (err) {
        console.error("Async dispatch error (pipeline trigger will pick it up):", err);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        videoId: newVideoId,
        status: dispatched ? "processing" : "queued",
        step: dispatched ? "Initializing Video Engine" : "queued",
        dispatched,
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
