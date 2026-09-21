import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

// Subfolder names defined under GDRIVE_MAIN_FOLDER_ID
export const FOLDER_NAMES = {
  IMAGES: "Images",
  VIDEOS: "Videos",
  AUDIOS: "Audios",
  FILES: "Files",
  CHATS: "Chats",
} as const;

type SubfolderType = (typeof FOLDER_NAMES)[keyof typeof FOLDER_NAMES];

// In-memory cache for folder IDs to reduce Drive API queries
const folderIdCache = new Map<string, string>();
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getEnv(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function cleanPrivateKey(key: string): string {
  let k = key.trim();

  // If entire service account JSON was provided
  if (k.startsWith("{")) {
    try {
      const parsed = JSON.parse(k);
      if (parsed.private_key) {
        k = parsed.private_key;
      }
    } catch {
      // ignore
    }
  }

  // Strip starting and trailing quotes
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'")) ||
    (k.startsWith("`") && k.endsWith("`"))
  ) {
    k = k.slice(1, -1);
  }

  // Handle escaped newlines
  k = k.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  return k.trim();
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Extract lines that do not start with '-----'
  const lines = pem
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("-----") && line.length > 0);

  // If lines are empty, fallback to regex stripping
  let b64 = lines.join("").replace(/\s+/g, "");
  if (!b64) {
    b64 = pem
      .replace(/-----BEGIN [A-Z0-9 ]+-----/g, "")
      .replace(/-----END [A-Z0-9 ]+-----/g, "")
      .replace(/\s+/g, "");
  }

  // Remove non-base64 characters
  b64 = b64.replace(/[^A-Za-z0-9+/=_-]/g, "");

  // Normalize base64url to standard base64
  let normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) {
    normalized += "=";
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64UrlEncode(data: string | Uint8Array): string {
  let binary = "";
  if (typeof data === "string") {
    binary = btoa(data);
  } else {
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    binary = btoa(binary);
  }
  return binary.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate OAuth2 Access Token using Google Service Account JWT (RS256)
 */
async function getGoogleDriveAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if valid for at least 2 more minutes
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 120) {
    return cachedAccessToken.token;
  }

  let clientEmail = getEnv("GDRIVE_CLIENT_EMAIL")
    .replace(/^["']|["']$/g, "")
    .trim();
  let rawKey = getEnv("GDRIVE_PRIVATE_KEY");

  if (rawKey.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawKey);
      if (parsed.client_email && !clientEmail) {
        clientEmail = parsed.client_email;
      }
      if (parsed.private_key) {
        rawKey = parsed.private_key;
      }
    } catch {
      // ignore
    }
  }

  if (!clientEmail || !rawKey) {
    throw new Error(
      "Missing Google Drive Service Account credentials: GDRIVE_CLIENT_EMAIL or GDRIVE_PRIVATE_KEY not set.",
    );
  }

  const privateKeyPem = cleanPrivateKey(rawKey);
  const keyBuffer = pemToArrayBuffer(privateKeyPem);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claims),
  )}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );

  const signedJwt = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Google OAuth token exchange failed (${tokenRes.status}): ${errorText}`);
  }

  const tokenJson = (await tokenRes.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: tokenJson.access_token,
    expiresAt: now + (tokenJson.expires_in || 3600),
  };

  return cachedAccessToken.token;
}

/**
 * Categorize a file by mimeType or extension into the correct subfolder:
 * - Images (image/*, .png, .jpg, .webp, etc.)
 * - Videos (video/*, .mp4, .webm, .mov, etc.)
 * - Audios (audio/*, .mp3, .wav, .m4a, etc.)
 * - Files (all other documents, archives, etc.)
 */
function determineTargetSubfolder(mimeType?: string, filename?: string): SubfolderType {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();

  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff|heic|avif)$/i.test(name)
  ) {
    return FOLDER_NAMES.IMAGES;
  }

  if (mime.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|m4v|3gp|flv|wmv|ts)$/i.test(name)) {
    return FOLDER_NAMES.VIDEOS;
  }

  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|aac|flac|wma|opus|aiff)$/i.test(name)) {
    return FOLDER_NAMES.AUDIOS;
  }

  if (name.startsWith("chat_") || name.includes("copilot_chat") || name.endsWith(".chat.json")) {
    return FOLDER_NAMES.CHATS;
  }

  return FOLDER_NAMES.FILES;
}

/**
 * Get or create subfolder under main folder
 */
async function getOrCreateSubfolder(
  accessToken: string,
  folderName: string,
  mainFolderId: string,
): Promise<string> {
  const cacheKey = `${mainFolderId}:${folderName}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey)!;
  }

  // 1. Search for existing subfolder inside main folder
  const query = `'${mainFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query,
  )}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchRes.ok) {
    const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
    if (searchJson.files && searchJson.files.length > 0) {
      const folderId = searchJson.files[0].id;
      folderIdCache.set(cacheKey, folderId);
      return folderId;
    }
  }

  // 2. Folder doesn't exist, create it inside the main folder
  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [mainFolderId],
      }),
    },
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create subfolder '${folderName}' (${createRes.status}): ${errText}`);
  }

  const createdJson = (await createRes.json()) as { id: string };
  folderIdCache.set(cacheKey, createdJson.id);
  return createdJson.id;
}

/**
 * Query Drive Storage Quota & Limits (15GB free tier tracking)
 */
async function getStorageQuota(accessToken: string) {
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota,user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        limitBytes: 16106127360,
        usageBytes: 0,
        usageInDriveBytes: 0,
        usageInTrashBytes: 0,
        freeBytes: 16106127360,
        usagePercent: 0,
        limitFormatted: "15.00 GB",
        usageFormatted: "0.00 GB",
        freeFormatted: "15.00 GB",
        isNearFull: false,
        warning: `Google Drive API responded with status ${res.status}: ${errText}`,
      };
    }

    const json = (await res.json()) as {
      storageQuota?: {
        limit?: string;
        usage?: string;
        usageInDrive?: string;
        usageInDriveTrash?: string;
      };
      user?: { displayName?: string; emailAddress?: string };
    };

    const limitBytes = Number(json.storageQuota?.limit || 16106127360); // 15GB default
    const usageBytes = Number(json.storageQuota?.usage || 0);
    const usageInDriveBytes = Number(json.storageQuota?.usageInDrive || 0);
    const usageInTrashBytes = Number(json.storageQuota?.usageInDriveTrash || 0);

    const freeBytes = Math.max(0, limitBytes - usageBytes);
    const usagePercent = limitBytes > 0 ? (usageBytes / limitBytes) * 100 : 0;

    return {
      limitBytes,
      usageBytes,
      usageInDriveBytes,
      usageInTrashBytes,
      freeBytes,
      usagePercent: Number(usagePercent.toFixed(2)),
      limitFormatted: `${(limitBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
      usageFormatted: `${(usageBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
      freeFormatted: `${(freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
      isNearFull: usagePercent > 90,
      user: json.user,
    };
  } catch (err) {
    return {
      limitBytes: 16106127360,
      usageBytes: 0,
      usageInDriveBytes: 0,
      usageInTrashBytes: 0,
      freeBytes: 16106127360,
      usagePercent: 0,
      limitFormatted: "15.00 GB",
      usageFormatted: "0.00 GB",
      freeFormatted: "15.00 GB",
      isNearFull: false,
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Make file publicly accessible via link
 */
async function makeFilePublic(accessToken: string, fileId: string) {
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      },
    );
  } catch {
    // Non-fatal if organization restricts public sharing
  }
}

/**
 * Upload binary buffer to Google Drive with metadata
 */
async function uploadBinaryToDrive(
  accessToken: string,
  targetFolderId: string,
  filename: string,
  mimeType: string,
  buffer: Uint8Array,
  makePublic = true,
) {
  const boundary = `-------314159265358979323846`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: filename,
    parents: [targetFolderId],
    mimeType,
  };

  const metaHeader = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata,
  )}`;
  const mediaHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const encoder = new TextEncoder();
  const metaHeaderBytes = encoder.encode(metaHeader);
  const mediaHeaderBytes = encoder.encode(mediaHeader);
  const closeDelimiterBytes = encoder.encode(closeDelimiter);

  const totalLength =
    metaHeaderBytes.length + mediaHeaderBytes.length + buffer.length + closeDelimiterBytes.length;

  const combined = new Uint8Array(totalLength);
  let offset = 0;

  combined.set(metaHeaderBytes, offset);
  offset += metaHeaderBytes.length;

  combined.set(mediaHeaderBytes, offset);
  offset += mediaHeaderBytes.length;

  combined.set(buffer, offset);
  offset += buffer.length;

  combined.set(closeDelimiterBytes, offset);

  const uploadUrl =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime";

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(totalLength),
    },
    body: combined,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploadedFile = (await uploadRes.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
    webContentLink?: string;
    createdTime?: string;
  };

  if (makePublic) {
    await makeFilePublic(accessToken, uploadedFile.id);
  }

  const directDownloadUrl = `https://drive.google.com/uc?id=${uploadedFile.id}&export=download`;

  return {
    ...uploadedFile,
    directDownloadUrl,
  };
}

/**
 * Empty Drive trash to free up storage
 */
async function emptyDriveTrash(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files/trash", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to empty trash (${res.status}): ${err}`);
  }

  return { ok: true, message: "Drive trash emptied successfully." };
}

/**
 * Auto-delete old or excessive files to preserve the 15GB quota
 */
async function autoDeleteFiles(
  accessToken: string,
  mainFolderId: string,
  options: {
    olderThanDays?: number;
    folder?: string;
    maxStoragePercent?: number;
    emptyTrashAfter?: boolean;
  },
) {
  const olderThanDays = options.olderThanDays ?? 30;
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  // Find target parent
  let parentId = mainFolderId;
  if (options.folder) {
    parentId = await getOrCreateSubfolder(accessToken, options.folder, mainFolderId);
  }

  // Find files older than cutoff
  const query = `'${parentId}' in parents and createdTime < '${cutoffDate}' and trashed = false`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query,
  )}&fields=files(id,name,size,createdTime,mimeType)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=createdTime asc`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Failed to list files for auto-deletion (${listRes.status}): ${err}`);
  }

  const listJson = (await listRes.json()) as {
    files?: Array<{ id: string; name: string; size?: string; createdTime?: string }>;
  };

  const filesToDelete = listJson.files || [];
  const deletedFiles: Array<{ id: string; name: string; size?: string }> = [];
  let freedBytes = 0;

  for (const file of filesToDelete) {
    try {
      const delRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (delRes.ok) {
        deletedFiles.push({ id: file.id, name: file.name, size: file.size });
        freedBytes += Number(file.size || 0);
      }
    } catch {
      // Continue next
    }
  }

  // If storage is still high or emptyTrash requested, empty trash
  if (options.emptyTrashAfter ?? true) {
    try {
      await emptyDriveTrash(accessToken);
    } catch {
      // Ignore
    }
  }

  return {
    deletedCount: deletedFiles.length,
    freedBytes,
    freedFormatted: `${(freedBytes / 1024 / 1024).toFixed(2)} MB`,
    deletedFiles,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  try {
    const mainFolderId = getEnv("GDRIVE_MAIN_FOLDER_ID");
    if (!mainFolderId) {
      throw new Error("GDRIVE_MAIN_FOLDER_ID is not configured in Supabase secrets.");
    }

    const accessToken = await getGoogleDriveAccessToken();

    // =========================================================================
    // GET REQUESTS: Storage Quota, Fetch / List files, Download file
    // =========================================================================
    if (req.method === "GET") {
      const action = url.searchParams.get("action") || "";

      // 1. Storage Quota Check (15GB storage monitoring)
      if (action === "storage" || url.searchParams.get("storage") === "true") {
        const quota = await getStorageQuota(accessToken);
        return new Response(JSON.stringify({ ok: true, ...quota }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Download File directly by fileId
      const fileId = url.searchParams.get("fileId");
      const download = url.searchParams.get("download") === "true";

      if (fileId && download) {
        // Fetch metadata first for filename & mimeType
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!metaRes.ok) {
          const err = await metaRes.text();
          return new Response(JSON.stringify({ ok: false, error: err }), {
            status: metaRes.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const meta = (await metaRes.json()) as { name: string; mimeType: string; size?: string };

        // Fetch media stream
        const mediaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        return new Response(mediaRes.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": meta.mimeType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(meta.name)}"`,
            ...(meta.size ? { "Content-Length": meta.size } : {}),
          },
        });
      }

      // 3. Get single file metadata
      if (fileId) {
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime,parents&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!metaRes.ok) {
          const err = await metaRes.text();
          return new Response(JSON.stringify({ ok: false, error: err }), {
            status: metaRes.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const file = await metaRes.json();
        return new Response(
          JSON.stringify({
            ok: true,
            file: {
              ...file,
              directDownloadUrl: `https://drive.google.com/uc?id=${fileId}&export=download`,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 4. List files (filter by subfolder: Images, Videos, Audios, Files, or all)
      const folderParam = url.searchParams.get("folder");
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
      const pageToken = url.searchParams.get("pageToken") || undefined;
      const search = url.searchParams.get("search") || "";

      let targetParentId = mainFolderId;
      if (folderParam && folderParam !== "all" && folderParam !== "root") {
        targetParentId = await getOrCreateSubfolder(accessToken, folderParam, mainFolderId);
      }

      let q = `'${targetParentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
      if (search) {
        q += ` and name contains '${search.replace(/'/g, "\\'")}'`;
      }

      const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
      listUrl.searchParams.set("q", q);
      listUrl.searchParams.set(
        "fields",
        "nextPageToken,files(id,name,mimeType,size,webViewLink,webContentLink,createdTime)",
      );
      listUrl.searchParams.set("pageSize", String(limit));
      listUrl.searchParams.set("orderBy", "createdTime desc");
      listUrl.searchParams.set("supportsAllDrives", "true");
      listUrl.searchParams.set("includeItemsFromAllDrives", "true");
      if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

      const listRes = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listRes.ok) {
        const err = await listRes.text();
        throw new Error(`Failed to list files (${listRes.status}): ${err}`);
      }

      const listJson = await listRes.json();
      const filesWithLinks = (listJson.files || []).map(
        (f: { id: string; [k: string]: unknown }) => ({
          ...f,
          directDownloadUrl: `https://drive.google.com/uc?id=${f.id}&export=download`,
        }),
      );

      return new Response(
        JSON.stringify({
          ok: true,
          folder: folderParam || "All",
          files: filesWithLinks,
          nextPageToken: listJson.nextPageToken,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // DELETE REQUEST: Remove file by ID
    // =========================================================================
    if (req.method === "DELETE") {
      const fileId = url.searchParams.get("fileId");
      if (!fileId) throw new Error("Missing 'fileId' query parameter.");

      const delRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!delRes.ok) {
        const err = await delRes.text();
        throw new Error(`Failed to delete file (${delRes.status}): ${err}`);
      }

      return new Response(JSON.stringify({ ok: true, deletedFileId: fileId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // POST REQUESTS: Upload, Push, Fetch, Auto-delete, Empty-trash
    // =========================================================================
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";

      // Handle multipart/form-data direct file upload
      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) throw new Error("No 'file' field found in multipart formData.");

        const customFolder = formData.get("folder") as string | null;
        const targetSubfolder = customFolder || determineTargetSubfolder(file.type, file.name);
        const targetFolderId = await getOrCreateSubfolder(
          accessToken,
          targetSubfolder,
          mainFolderId,
        );

        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        const uploaded = await uploadBinaryToDrive(
          accessToken,
          targetFolderId,
          file.name,
          file.type || "application/octet-stream",
          buffer,
          true,
        );

        return new Response(
          JSON.stringify({
            ok: true,
            folder: targetSubfolder,
            file: uploaded,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Handle JSON Body
      const body = await req.json();
      const action = (body.action || "upload").toLowerCase();

      // 1. Storage Quota Check
      if (action === "storage" || action === "quota") {
        const quota = await getStorageQuota(accessToken);
        return new Response(JSON.stringify({ ok: true, ...quota }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Empty Trash
      if (action === "empty-trash") {
        const emptyResult = await emptyDriveTrash(accessToken);
        return new Response(JSON.stringify({ ok: true, ...emptyResult }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3. Auto-Delete & Cleanup
      if (action === "auto-delete" || action === "cleanup") {
        const cleanupResult = await autoDeleteFiles(accessToken, mainFolderId, {
          olderThanDays: body.olderThanDays,
          folder: body.folder,
          maxStoragePercent: body.maxStoragePercent,
          emptyTrashAfter: body.emptyTrash ?? true,
        });

        return new Response(JSON.stringify({ ok: true, ...cleanupResult }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Delete single file
      if (action === "delete") {
        const fileId = body.fileId;
        if (!fileId) throw new Error("Missing 'fileId' in request body.");

        const delRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (!delRes.ok) {
          const err = await delRes.text();
          throw new Error(`Delete failed (${delRes.status}): ${err}`);
        }

        return new Response(JSON.stringify({ ok: true, deletedFileId: fileId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 5. List / Fetch files
      if (action === "list" || action === "fetch-files") {
        const folderParam = body.folder;
        let targetParentId = mainFolderId;
        if (folderParam && folderParam !== "all" && folderParam !== "root") {
          targetParentId = await getOrCreateSubfolder(accessToken, folderParam, mainFolderId);
        }

        let q = `'${targetParentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
        if (body.search) {
          q += ` and name contains '${body.search.replace(/'/g, "\\'")}'`;
        }

        const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
        listUrl.searchParams.set("q", q);
        listUrl.searchParams.set(
          "fields",
          "nextPageToken,files(id,name,mimeType,size,webViewLink,webContentLink,createdTime)",
        );
        listUrl.searchParams.set("pageSize", String(body.limit || 50));
        listUrl.searchParams.set("orderBy", body.orderBy || "createdTime desc");
        listUrl.searchParams.set("supportsAllDrives", "true");
        listUrl.searchParams.set("includeItemsFromAllDrives", "true");
        if (body.pageToken) listUrl.searchParams.set("pageToken", body.pageToken);

        const listRes = await fetch(listUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!listRes.ok) {
          const err = await listRes.text();
          throw new Error(`Failed to list files (${listRes.status}): ${err}`);
        }

        const listJson = await listRes.json();
        const filesWithLinks = (listJson.files || []).map(
          (f: { id: string; [k: string]: unknown }) => ({
            ...f,
            directDownloadUrl: `https://drive.google.com/uc?id=${f.id}&export=download`,
          }),
        );

        return new Response(
          JSON.stringify({
            ok: true,
            folder: folderParam || "All",
            files: filesWithLinks,
            nextPageToken: listJson.nextPageToken,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 6. Upload from Remote URL (Images, Videos, Audios, Files)
      if (action === "upload-from-url" || body.fileUrl) {
        const fileUrl = body.fileUrl;
        if (!fileUrl) throw new Error("Missing 'fileUrl' for upload-from-url action.");

        const remoteFetch = await fetch(fileUrl);
        if (!remoteFetch.ok) {
          throw new Error(`Failed to download remote file from ${fileUrl} (${remoteFetch.status})`);
        }

        const remoteBuffer = new Uint8Array(await remoteFetch.arrayBuffer());
        const detectedMime =
          body.mimeType ||
          remoteFetch.headers.get("content-type")?.split(";")[0] ||
          "application/octet-stream";

        let filename = body.filename;
        if (!filename) {
          const urlPath = new URL(fileUrl).pathname;
          const extracted = urlPath.split("/").pop() || "";
          filename = extracted.includes(".") ? extracted : `file_${Date.now()}`;
        }

        const targetSubfolder = body.folder || determineTargetSubfolder(detectedMime, filename);
        const targetFolderId = await getOrCreateSubfolder(
          accessToken,
          targetSubfolder,
          mainFolderId,
        );

        const uploaded = await uploadBinaryToDrive(
          accessToken,
          targetFolderId,
          filename,
          detectedMime,
          remoteBuffer,
          body.makePublic ?? true,
        );

        return new Response(
          JSON.stringify({
            ok: true,
            folder: targetSubfolder,
            file: uploaded,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 7. Upload Base64 Data Payload (or Data URL)
      if (action === "upload" || body.base64Data || body.dataUrl) {
        let rawBase64 = body.base64Data || body.dataUrl || "";
        let detectedMime = body.mimeType || "application/octet-stream";

        if (rawBase64.startsWith("data:")) {
          const parts = rawBase64.split(",");
          const mimeMatch = parts[0].match(/:(.*?);/);
          if (mimeMatch) detectedMime = mimeMatch[1];
          rawBase64 = parts[1] || "";
        }

        if (!rawBase64) {
          throw new Error("Missing 'base64Data' or 'dataUrl' in upload body.");
        }

        const binary = atob(rawBase64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          buffer[i] = binary.charCodeAt(i);
        }

        const filename = body.filename || `upload_${Date.now()}`;
        const targetSubfolder = body.folder || determineTargetSubfolder(detectedMime, filename);
        const targetFolderId = await getOrCreateSubfolder(
          accessToken,
          targetSubfolder,
          mainFolderId,
        );

        const uploaded = await uploadBinaryToDrive(
          accessToken,
          targetFolderId,
          filename,
          detectedMime,
          buffer,
          body.makePublic ?? true,
        );

        return new Response(
          JSON.stringify({
            ok: true,
            folder: targetSubfolder,
            file: uploaded,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      throw new Error(
        `Unknown action: '${action}'. Supported: upload, upload-from-url, list, get, delete, auto-delete, empty-trash, storage.`,
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
