import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const THREADS_GRAPH = "https://graph.threads.net/v1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ActionType = "publish_post" | "publish_reel" | "crosspost";

type Target = {
  id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  access_token: string | null;
  metadata?: Record<string, unknown> | null;
};

type PublishRequest = {
  target: Target;
  action: ActionType;
  caption?: string;
  mediaUrl?: string;
  // Optional workflow/context payload
  hookTitle?: string;
  hashtags?: unknown;
  category?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(
  url: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meta API error [${res.status}]: ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`Meta API error [${res.status}]: ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function waitForContainer(base: string, containerId: string, token: string) {
  const deadline = Date.now() + 180_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const info = await getJson(
      `${base}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    const code = String(info["status_code"] ?? "");
    lastStatus = String(info["status"] ?? code);
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`The platform rejected the media: ${lastStatus || code}`);
    }
    await sleep(6000);
  }
  throw new Error(`The platform is still processing the video (${lastStatus || "IN_PROGRESS"}).`);
}

const NICHE_HASHTAGS: Record<string, string[]> = {
  "Cosmic Universe": ["#cosmos", "#universe", "#space", "#astronomy", "#nebula"],
  "Nature Beauty": ["#nature", "#wildlife", "#naturelovers", "#earth", "#landscape"],
  "Ocean & Sky": ["#ocean", "#sky", "#seascape", "#clouds", "#bluehour"],
  "Micro World": ["#macro", "#microworld", "#macrophotography", "#tinyworld", "#details"],
};

const FALLBACK_HOOK = "A moment worth watching.";
const FALLBACK_HASHTAGS = ["#cosmos", "#nature", "#universe", "#explore", "#reels"];

function normalizeHashtags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,]+/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item
      .trim()
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (!tag) continue;
    const key = `#${tag}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${tag}`);
    if (out.length >= 5) break;
  }
  return out;
}

function oneLine(text: string | null | undefined): string {
  const first =
    (text ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
}

function buildCaption(req: PublishRequest): string {
  if (req.caption && !req.hookTitle && !req.hashtags) {
    return req.caption.trim();
  }
  const hook = oneLine(req.hookTitle) || oneLine(req.caption) || FALLBACK_HOOK;
  let tags = normalizeHashtags(req.hashtags);
  if (tags.length < 4) {
    const niche = NICHE_HASHTAGS[req.category ?? ""] ?? FALLBACK_HASHTAGS;
    tags = normalizeHashtags([...tags, ...niche, ...FALLBACK_HASHTAGS]);
  }
  return `${hook}\n\n${tags.join(" ")}`.trim();
}

export async function publishToMeta(
  target: Target,
  action: ActionType,
  caption: string,
  mediaUrl: string,
): Promise<string> {
  const token = target.access_token;
  if (!token) throw new Error("This account needs to be reconnected (missing access token).");
  const isVideo = action === "publish_reel" || action === "crosspost";

  const idOf = (res: Record<string, unknown>) => {
    const id = res["id"] ?? res["post_id"] ?? res["video_id"];
    if (!id) throw new Error("The platform did not confirm the post.");
    return String(id);
  };

  // 1. Facebook Page
  if (target.provider === "facebook_page") {
    if (isVideo) {
      if (!mediaUrl) throw new Error("A video URL is required for a reel.");
      const res = await postJson(`${GRAPH}/${target.external_id}/videos`, {
        file_url: mediaUrl,
        description: caption,
        access_token: token,
      });
      return idOf(res);
    }
    if (mediaUrl) {
      const res = await postJson(`${GRAPH}/${target.external_id}/photos`, {
        url: mediaUrl,
        caption,
        access_token: token,
      });
      return idOf(res);
    }
    const res = await postJson(`${GRAPH}/${target.external_id}/feed`, {
      message: caption,
      access_token: token,
    });
    return idOf(res);
  }

  // 2. Instagram
  if (target.provider === "instagram") {
    if (!mediaUrl) throw new Error("Instagram requires an image or video URL.");
    const container = await postJson(`${GRAPH}/${target.external_id}/media`, {
      ...(isVideo ? { media_type: "REELS", video_url: mediaUrl } : { image_url: mediaUrl }),
      caption,
      access_token: token,
    });
    const containerId = String(container["id"]);
    await waitForContainer(GRAPH, containerId, token);
    const res = await postJson(`${GRAPH}/${target.external_id}/media_publish`, {
      creation_id: containerId,
      access_token: token,
    });
    return idOf(res);
  }

  // 3. Threads
  if (target.provider === "threads") {
    const container = await postJson(`${THREADS_GRAPH}/${target.external_id}/threads`, {
      media_type: mediaUrl ? (isVideo ? "VIDEO" : "IMAGE") : "TEXT",
      ...(mediaUrl ? (isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }) : {}),
      text: caption,
      access_token: token,
    });
    if (mediaUrl) await waitForContainer(THREADS_GRAPH, String(container["id"]), token);
    const res = await postJson(`${THREADS_GRAPH}/${target.external_id}/threads_publish`, {
      creation_id: String(container["id"]),
      access_token: token,
    });
    return idOf(res);
  }

  throw new Error(`Unsupported provider: ${target.provider}`);
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

    // Mode A: Batch publish by workflow_id or target list
    // Mode B: Direct single target publication
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let targetsToPublish: {
      target: Target;
      action: ActionType;
      caption: string;
      mediaUrl: string;
    }[] = [];

    if (body.workflow_id && supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: workflow, error: wfError } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", body.workflow_id)
        .single();

      if (wfError || !workflow) {
        throw new Error(`Workflow not found: ${wfError?.message || body.workflow_id}`);
      }

      const { data: connections, error: connError } = await supabase
        .from("social_connections")
        .select("id, provider, external_id, display_name, access_token, metadata")
        .eq("user_id", workflow.user_id)
        .in("id", workflow.targets ?? []);

      if (connError) throw new Error(connError.message);

      let mediaUrl = workflow.media_url ?? "";
      if (!mediaUrl && workflow.media_path) {
        const path = workflow.media_path.replace(/^videos\//, "");
        const { data: signed } = await supabase.storage
          .from("videos")
          .createSignedUrl(path, 60 * 60 * 6);
        mediaUrl = signed?.signedUrl ?? "";
      }

      const caption = buildCaption({
        target: { id: "", provider: "", external_id: "", display_name: null, access_token: null },
        action: workflow.action_type,
        caption: workflow.caption,
        hookTitle: workflow.hook_title,
        hashtags: workflow.hashtags,
        category: (workflow.creation_config as Record<string, unknown>)?.category as string,
        mediaUrl,
      });

      const isVideo =
        workflow.action_type === "publish_reel" || workflow.action_type === "crosspost";
      const action = (
        isVideo && workflow.action_type === "publish_post" ? "publish_reel" : workflow.action_type
      ) as ActionType;

      targetsToPublish = (connections ?? []).map((c) => ({
        target: c as Target,
        action,
        caption,
        mediaUrl,
      }));
    } else if (body.target) {
      const caption = buildCaption(body);
      const mediaUrl = body.mediaUrl || body.media_url || "";
      const action = body.action || body.action_type || "publish_post";
      targetsToPublish = [
        {
          target: body.target,
          action,
          caption,
          mediaUrl,
        },
      ];
    } else {
      throw new Error("Invalid request: provide either 'workflow_id' or 'target' object.");
    }

    const results: {
      targetId: string;
      account: string;
      ok: boolean;
      postId?: string;
      error?: string;
    }[] = [];

    for (const item of targetsToPublish) {
      try {
        const postId = await publishToMeta(item.target, item.action, item.caption, item.mediaUrl);
        results.push({
          targetId: item.target.id,
          account: item.target.display_name ?? item.target.provider,
          ok: true,
          postId,
        });
      } catch (err) {
        results.push({
          targetId: item.target.id,
          account: item.target.display_name ?? item.target.provider,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const allOk = results.length > 0 && results.every((r) => r.ok);

    return new Response(
      JSON.stringify({
        ok: allOk,
        results,
        count: results.length,
      }),
      {
        status: allOk ? 200 : 207,
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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
