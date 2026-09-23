// YouTube backend function.
//
// Backend-only: every call must present the worker token stored in the
// `job_runner` table. It owns the Google OAuth credentials
// (GOOGLE_CLOUD_API_ID / GOOGLE_CLOUD_API_SECRET) and the YouTube Data API v3
// upload, so neither the browser nor the app server ever sees them.
//
// Actions:
//   config    -> { clientId, configured }
//   exchange  -> { code, redirectUri } => refresh token + channel details
//   upload    -> { refreshToken, videoUrl, title, ... } => YouTube video id

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-worker-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

async function authorized(req: Request): Promise<boolean> {
  const token = req.headers.get("x-worker-secret");
  if (!token) return false;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data } = await admin.rpc("verify_worker_token", { p_token: token });
  return data === true;
}

function credentials() {
  const clientId = (Deno.env.get("GOOGLE_CLOUD_API_ID") ?? "").trim();
  const clientSecret = (Deno.env.get("GOOGLE_CLOUD_API_SECRET") ?? "").trim();
  return { clientId, clientSecret };
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google refused the request [${res.status}]: ${text}`);
  return JSON.parse(text) as Record<string, string>;
}

async function accessTokenFrom(refreshToken: string) {
  const { clientId, clientSecret } = credentials();
  const out = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return String(out["access_token"] ?? "");
}

async function exchange(code: string, redirectUri: string) {
  const { clientId, clientSecret } = credentials();
  const out = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code,
  });
  const refreshToken = String(out["refresh_token"] ?? "");
  const accessToken = String(out["access_token"] ?? "");
  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and authorize again.",
    );
  }
  const res = await fetch(CHANNELS_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => ({}));
  const channel = body?.items?.[0];
  if (!channel) throw new Error("No YouTube channel is attached to that Google account.");
  return {
    refreshToken,
    channelId: String(channel.id),
    title: channel.snippet?.title ?? null,
    customUrl: channel.snippet?.customUrl?.replace(/^@/, "") ?? null,
    avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
  };
}

type UploadInput = {
  refreshToken: string;
  videoUrl: string;
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: string;
  publishAt?: string | null;
  isShort?: boolean;
  madeForKids?: boolean;
};

async function upload(input: UploadInput) {
  const accessToken = await accessTokenFrom(input.refreshToken);
  if (!accessToken) throw new Error("Could not refresh the YouTube access token.");

  const media = await fetch(input.videoUrl);
  if (!media.ok) throw new Error(`The video file could not be downloaded (${media.status}).`);
  const bytes = new Uint8Array(await media.arrayBuffer());

  const rawTitle = (input.title ?? "").trim() || "New video";
  let title = rawTitle;

  if (input.isShort) {
    const existingTags = (title.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.trim());
    if (existingTags.length === 0) {
      // Append 2 to 3 relevant hashtags directly at the end of the title string
      const suggestedTags: string[] = [];
      const lower = `${title} ${(input.tags ?? []).join(" ")}`.toLowerCase();
      if (lower.includes("space") || lower.includes("cosmos") || lower.includes("star")) {
        suggestedTags.push("#Space", "#Universe", "#Shorts");
      } else if (lower.includes("ocean") || lower.includes("sea") || lower.includes("deep")) {
        suggestedTags.push("#Ocean", "#DeepSea", "#Shorts");
      } else if (lower.includes("nature") || lower.includes("wildlife")) {
        suggestedTags.push("#Nature", "#Wildlife", "#Shorts");
      } else {
        suggestedTags.push("#Entertainment", "#Viral", "#Shorts");
      }

      const tagsToAdd = suggestedTags.slice(0, 3);
      const combined = `${title} ${tagsToAdd.join(" ")}`.trim();
      title = combined.length <= 100 ? combined : `${title} #Shorts`.slice(0, 100);
    }
  }

  // Strict Constraint: Entire title string MUST NOT exceed 100 characters
  title = title.slice(0, 100).trim();

  const scheduled =
    input.publishAt && new Date(input.publishAt).getTime() > Date.now()
      ? new Date(input.publishAt).toISOString()
      : null;

  const metadata = {
    snippet: {
      title,
      description: (input.description ?? "").slice(0, 4900),
      tags: (input.tags ?? []).slice(0, 15),
      categoryId: input.categoryId || "24", // Entertainment
    },
    status: {
      privacyStatus: scheduled ? "private" : input.privacyStatus || "public",
      selfDeclaredMadeForKids: input.madeForKids === true,
      ...(scheduled ? { publishAt: scheduled } : {}),
    },
  };

  const start = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-upload-content-length": String(bytes.byteLength),
      "x-upload-content-type": media.headers.get("content-type") ?? "video/mp4",
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    throw new Error(`YouTube refused the upload [${start.status}]: ${await start.text()}`);
  }
  const session = start.headers.get("location");
  if (!session) throw new Error("YouTube did not open an upload session.");

  const done = await fetch(session, {
    method: "PUT",
    headers: {
      "content-type": media.headers.get("content-type") ?? "video/mp4",
      "content-length": String(bytes.byteLength),
    },
    body: bytes,
  });
  const text = await done.text();
  if (!done.ok) throw new Error(`YouTube rejected the video [${done.status}]: ${text}`);
  const result = JSON.parse(text);
  if (!result?.id) throw new Error("YouTube did not confirm the upload.");
  return { videoId: String(result.id), url: `https://youtu.be/${result.id}` };
}

type UpdateInput = {
  refreshToken: string;
  videoId: string;
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: string;
};

/** Post-upload metadata edit: title, description, tags, privacy. */
async function update(input: UpdateInput) {
  const accessToken = await accessTokenFrom(input.refreshToken);
  if (!accessToken) throw new Error("Could not refresh the YouTube access token.");
  if (!input.videoId) throw new Error("A video id is required.");

  const current = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${input.videoId}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const currentBody = await current.json();
  if (!current.ok) throw new Error(`YouTube refused the read [${current.status}].`);
  const item = currentBody?.items?.[0];
  if (!item) throw new Error("That video was not found on the channel.");

  const snippet = {
    title: (input.title ?? item.snippet?.title ?? "New video").slice(0, 100),
    description: (input.description ?? item.snippet?.description ?? "").slice(0, 4900),
    tags: (input.tags ?? item.snippet?.tags ?? []).slice(0, 15),
    categoryId: input.categoryId || item.snippet?.categoryId || "24",
  };
  const status = {
    privacyStatus: input.privacyStatus || item.status?.privacyStatus || "public",
    selfDeclaredMadeForKids: item.status?.selfDeclaredMadeForKids === true,
  };

  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet,status", {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ id: input.videoId, snippet, status }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube rejected the update [${res.status}]: ${text}`);
  return { videoId: input.videoId, url: `https://youtu.be/${input.videoId}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await authorized(req))) return json({ ok: false, error: "Forbidden" }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = String(body["action"] ?? "");

  try {
    if (action === "config") {
      const { clientId, clientSecret } = credentials();
      return json({ ok: true, clientId, configured: Boolean(clientId && clientSecret) });
    }
    if (action === "exchange") {
      const result = await exchange(String(body["code"] ?? ""), String(body["redirectUri"] ?? ""));
      return json({ ok: true, ...result });
    }
    if (action === "upload") {
      const result = await upload(body as unknown as UploadInput);
      return json({ ok: true, ...result });
    }
    if (action === "update") {
      const result = await update(body as unknown as UpdateInput);
      return json({ ok: true, ...result });
    }
    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
