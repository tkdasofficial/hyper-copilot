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
const FALLBACK_HASHTAGS = ["#Cosmos", "#Nature", "#Universe", "#Explore", "#Reels"];

const PROMPT_NOISE_RE =
  /\b(?:cinematic|photorealistic|hyper-realistic|unreal engine|octane render|8k|4k|high resolution|masterpiece|best quality|trending on artstation|sharp focus|depth of field|aspect ratio|shutter speed|iso \d+|negative prompt|camera|lens|vivid colors|volumetric lighting|ray tracing|award winning|ultra realistic|high definition|natural lighting|studio lighting|render)\b/gi;

function sanitizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/["“”'‘’`]/g, "")
    .replace(/[|*_#]+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractCleanStory(rawText: string | null | undefined): string {
  const sanitized = sanitizeText(rawText);
  const clean = sanitized
    .replace(PROMPT_NOISE_RE, "")
    .replace(/[,\s]{2,}/g, " ")
    .trim();
  return clean || "An extraordinary cinematic journey.";
}

function extractCoreSubject(text: string, categoryFallback?: string | null): string {
  const firstSentence = text.split(/[.!?\n]/)[0] ?? text;
  const cleaned = firstSentence
    .replace(/^(?:a|an|the|this|in|at|deep inside|close up of|cinematic shot of|exploring)\s+/i, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 8) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  if (words.length > 8) {
    return words
      .slice(0, 6)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return categoryFallback || "The Deep Unknown";
}

function extractDynamicHashtags(
  text: string,
  userTags: unknown,
  category?: string | null,
): string[] {
  const pool: string[] = [];
  const lower = `${text} ${category || ""}`.toLowerCase();

  if (userTags) {
    pool.push(...normalizeHashtags(userTags, 10));
  }

  if (
    lower.includes("space") ||
    lower.includes("cosmos") ||
    lower.includes("galaxy") ||
    lower.includes("planet") ||
    lower.includes("star") ||
    lower.includes("astronomy") ||
    lower.includes("nebula")
  ) {
    pool.push("#Space", "#Universe", "#Cosmos", "#Astronomy", "#DeepSpace");
  }
  if (
    lower.includes("ocean") ||
    lower.includes("sea") ||
    lower.includes("underwater") ||
    lower.includes("marine") ||
    lower.includes("whale") ||
    lower.includes("abyss") ||
    lower.includes("shark") ||
    lower.includes("reef")
  ) {
    pool.push("#Ocean", "#DeepSea", "#MarineLife", "#Underwater", "#OceanExploration");
  }
  if (
    lower.includes("nature") ||
    lower.includes("forest") ||
    lower.includes("wildlife") ||
    lower.includes("animal") ||
    lower.includes("earth") ||
    lower.includes("mountain")
  ) {
    pool.push("#Nature", "#Wildlife", "#Earth", "#Wilderness", "#NatureLovers");
  }
  if (
    lower.includes("macro") ||
    lower.includes("micro") ||
    lower.includes("insect") ||
    lower.includes("crystal") ||
    lower.includes("tardigrade") ||
    lower.includes("tiny")
  ) {
    pool.push("#MicroWorld", "#Macro", "#TinyWorld", "#NatureDetails", "#Macrophotography");
  }
  if (
    lower.includes("tech") ||
    lower.includes("ai") ||
    lower.includes("future") ||
    lower.includes("cyberpunk") ||
    lower.includes("quantum") ||
    lower.includes("physics")
  ) {
    pool.push("#Technology", "#SciFi", "#Physics", "#Futuristic", "#Science");
  }
  if (
    lower.includes("ancient") ||
    lower.includes("ruin") ||
    lower.includes("temple") ||
    lower.includes("history") ||
    lower.includes("mystery")
  ) {
    pool.push("#Mystery", "#AncientHistory", "#History", "#Archaeology", "#Legends");
  }

  const niche = NICHE_HASHTAGS[category ?? ""] ?? [];
  pool.push(...niche, ...FALLBACK_HASHTAGS);

  return normalizeHashtags(pool, 15);
}

function normalizeHashtags(input: unknown, limit = 15): string[] {
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
    if (out.length >= limit) break;
  }
  return out;
}

function oneLine(text: string | null | undefined, max = 120): string {
  const first =
    (text ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return first.length > max ? `${first.slice(0, max - 3).trimEnd()}…` : first;
}

/**
 * Builds destination-specific metadata:
 * - Meta (Instagram & Facebook): Attention-grabbing hook + story + 4 to 5 targeted hashtags.
 * - Threads: Short conversational statement + strictly 1 main Topic Tag.
 */
function buildPlatformPayload(
  provider: string,
  req: {
    hookTitle?: string;
    caption?: string;
    hashtags?: unknown;
    category?: string;
    script?: string;
    story?: string;
    title?: string;
  },
): { title: string; caption: string } {
  const rawStory = req.script || req.story || req.caption || req.hookTitle || "";
  const cleanStory = extractCleanStory(rawStory);
  const subject = extractCoreSubject(cleanStory, req.category);
  const tagPool = extractDynamicHashtags(cleanStory, req.hashtags, req.category);

  if (provider === "threads") {
    let conversationalTitle = "";
    if (req.hookTitle && req.hookTitle.trim()) {
      conversationalTitle = req.hookTitle.trim().replace(/[#]/g, "");
    } else {
      const lower = cleanStory.toLowerCase();
      if (lower.includes("space") || lower.includes("star") || lower.includes("planet")) {
        conversationalTitle = `Still can't wrap my head around how massive ${subject} actually is.`;
      } else if (lower.includes("ocean") || lower.includes("deep") || lower.includes("water")) {
        conversationalTitle = `Exploring ${subject} honestly feels like visiting an alien planet.`;
      } else if (
        lower.includes("micro") ||
        lower.includes("tardigrade") ||
        lower.includes("tiny")
      ) {
        conversationalTitle = `The details inside ${subject} are genuinely mind-bending.`;
      } else {
        conversationalTitle = `Taking a moment to appreciate the surreal beauty of ${subject}.`;
      }
    }

    // Threads officially supports only 1 active tag per post
    const singleTopicTag = tagPool[0] || "#Storytelling";
    const room = 500 - singleTopicTag.length - 2;
    const safeTitle =
      conversationalTitle.length > room
        ? `${conversationalTitle.slice(0, room - 1).trimEnd()}…`
        : conversationalTitle;

    return {
      title: safeTitle.slice(0, 100),
      caption: `${safeTitle}\n\n${singleTopicTag}`.trim().slice(0, 500),
    };
  }

  // Instagram & Facebook: Attention-grabbing hook reflecting narrative + 4 to 5 targeted hashtags
  let hook = req.title || req.hookTitle;
  if (!hook || !hook.trim()) {
    const lower = cleanStory.toLowerCase();
    if (lower.includes("unbelievable") || lower.includes("rare") || lower.includes("first time")) {
      hook = `A rare, unbelievable look into ${subject}`;
    } else if (lower.includes("deep") || lower.includes("abyss") || lower.includes("trench")) {
      hook = `Journey deep into the heart of ${subject}`;
    } else if (lower.includes("danger") || lower.includes("shock") || lower.includes("extreme")) {
      hook = `The incredible power of ${subject} revealed`;
    } else {
      hook = `Witness the breathtaking reality of ${subject}`;
    }
  }

  const metaTags = tagPool.slice(0, 5);
  while (metaTags.length < 4 && tagPool.length > metaTags.length) {
    metaTags.push(tagPool[metaTags.length]);
  }

  const firstSentence = cleanStory.split(/[.!?\n]/)[0]?.trim();
  const storyLead =
    firstSentence && firstSentence.length > 20 && firstSentence !== hook
      ? firstSentence
      : cleanStory.slice(0, 200).trimEnd();

  const caption = `${hook}\n\n${storyLead}\n\n${metaTags.join(" ")}`.trim();

  return {
    title: hook.slice(0, 100),
    caption,
  };
}

export async function publishToMeta(
  target: Target,
  action: ActionType,
  caption: string,
  mediaUrl: string,
  title?: string,
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
        ...(title ? { title } : {}),
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
    const textBody = caption.slice(0, 500);
    const container = await postJson(`${THREADS_GRAPH}/${target.external_id}/threads`, {
      media_type: mediaUrl ? (isVideo ? "VIDEO" : "IMAGE") : "TEXT",
      ...(mediaUrl ? (isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }) : {}),
      text: textBody,
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
      title?: string;
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

      let videoScript = "";
      if (workflow.pending_video_id) {
        const { data: vid } = await supabase
          .from("videos")
          .select("prompt")
          .eq("id", workflow.pending_video_id)
          .maybeSingle();
        videoScript = vid?.prompt ?? "";
      }

      const isVideo =
        workflow.action_type === "publish_reel" || workflow.action_type === "crosspost";
      const action = (
        isVideo && workflow.action_type === "publish_post" ? "publish_reel" : workflow.action_type
      ) as ActionType;

      targetsToPublish = (connections ?? []).map((c) => {
        const payload = buildPlatformPayload(c.provider, {
          hookTitle: workflow.hook_title,
          caption: workflow.caption,
          hashtags: workflow.hashtags,
          category: (workflow.creation_config as Record<string, unknown>)?.category as string,
          script:
            videoScript ||
            ((workflow.creation_config as Record<string, unknown>)?.instructions as string) ||
            workflow.caption,
          title: workflow.hook_title,
        });

        return {
          target: c as Target,
          action,
          caption: payload.caption,
          title: payload.title,
          mediaUrl,
        };
      });
    } else if (body.target) {
      const mediaUrl = body.mediaUrl || body.media_url || "";
      const action = body.action || body.action_type || "publish_post";
      const payload = buildPlatformPayload(body.target.provider, {
        hookTitle: body.hookTitle,
        caption: body.caption,
        hashtags: body.hashtags,
        category: body.category,
        script: body.script || body.story,
        title: body.title,
      });

      targetsToPublish = [
        {
          target: body.target,
          action,
          caption: body.caption && !body.script && !body.hookTitle ? body.caption : payload.caption,
          title: payload.title,
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
        const postId = await publishToMeta(
          item.target,
          item.action,
          item.caption,
          item.mediaUrl,
          item.title,
        );
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
