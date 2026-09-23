const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

// Default fallback folder specified in task
const DEFAULT_MAIN_FOLDER_ID = "1JGjibA287ds3SFoT_Fl2z8cJ96eCDUFs";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
let cachedChatsFolderId: string | null = null;

function getEnv(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function cleanPrivateKey(key: string): string {
  let k = key.trim();
  if (k.startsWith("{")) {
    try {
      const parsed = JSON.parse(k);
      if (parsed.private_key) k = parsed.private_key;
    } catch {
      // ignore
    }
  }
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'")) ||
    (k.startsWith("`") && k.endsWith("`"))
  ) {
    k = k.slice(1, -1);
  }
  k = k.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  return k.trim();
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const lines = pem
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("-----") && line.length > 0);

  let b64 = lines.join("").replace(/\s+/g, "");
  if (!b64) {
    b64 = pem
      .replace(/-----BEGIN [A-Z0-9 ]+-----/g, "")
      .replace(/-----END [A-Z0-9 ]+-----/g, "")
      .replace(/\s+/g, "");
  }
  b64 = b64.replace(/[^A-Za-z0-9+/=_-]/g, "");
  let normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) normalized += "=";

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
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 120) {
    return cachedAccessToken.token;
  }

  // 1. First priority: Check for User OAuth Refresh Token
  const refreshToken =
    getEnv("GOOGLE_DRIVE_REFRESH_TOKEN") ||
    getEnv("GDRIVE_REFRESH_TOKEN") ||
    getEnv("GOOGLE_REFRESH_TOKEN");
  const clientId =
    getEnv("GOOGLE_CLIENT_ID") || getEnv("GOOGLE_CLOUD_API_ID") || getEnv("GDRIVE_CLIENT_ID");
  const clientSecret =
    getEnv("GOOGLE_CLIENT_SECRET") ||
    getEnv("GOOGLE_CLOUD_API_SECRET") ||
    getEnv("GDRIVE_CLIENT_SECRET");

  if (refreshToken && clientId && clientSecret) {
    try {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as {
          access_token: string;
          expires_in: number;
        };
        if (refreshData.access_token) {
          cachedAccessToken = {
            token: refreshData.access_token,
            expiresAt: now + (refreshData.expires_in || 3600),
          };
          return cachedAccessToken.token;
        }
      }
    } catch {
      // fallback to service account
    }
  }

  // 2. Service Account JWT fallback
  let clientEmail = (
    getEnv("GOOGLE_SERVICE_ACCOUNT_ID") ||
    getEnv("GDRIVE_CLIENT_EMAIL") ||
    getEnv("GOOGLE_CLIENT_EMAIL") ||
    ""
  )
    .replace(/^["']|["']$/g, "")
    .trim();
  let rawKey =
    getEnv("GDRIVE_PRIVATE_KEY") ||
    getEnv("SERVICE_ACCOUNT_JSON") ||
    getEnv("GOOGLE_SERVICE_ACCOUNT_JSON") ||
    getEnv("GDRIVE_SERVICE_ACCOUNT_JSON") ||
    "";

  if (rawKey.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawKey);
      if (parsed.client_email && !clientEmail) clientEmail = parsed.client_email;
      if (parsed.private_key) rawKey = parsed.private_key;
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
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
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
 * Locate or create the "Chats" sub-folder inside the Main Storage Folder ID.
 */
async function getOrCreateChatsFolder(accessToken: string): Promise<string> {
  // Check if explicitly configured in secrets
  const explicitFolderId = getEnv("GDRIVE_CHATS_FOLDER_ID");
  if (explicitFolderId) {
    return explicitFolderId;
  }

  if (cachedChatsFolderId) {
    return cachedChatsFolderId;
  }

  const mainFolderId =
    getEnv("GOOGLE_DRIVE_FOLDER_ID") ||
    getEnv("GDRIVE_MAIN_FOLDER_ID") ||
    getEnv("GDRIVE_FOLDER_ID") ||
    DEFAULT_MAIN_FOLDER_ID;

  // 1. Search for existing 'Chats' folder inside main folder
  const query = `'${mainFolderId}' in parents and name = 'Chats' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query,
  )}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchRes.ok) {
    const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
    if (searchJson.files && searchJson.files.length > 0) {
      cachedChatsFolderId = searchJson.files[0].id;
      return cachedChatsFolderId;
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
        name: "Chats",
        mimeType: "application/vnd.google-apps.folder",
        parents: [mainFolderId],
      }),
    },
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create 'Chats' folder (${createRes.status}): ${errText}`);
  }

  const createdJson = (await createRes.json()) as { id: string };
  cachedChatsFolderId = createdJson.id;
  return cachedChatsFolderId;
}

/**
 * Find existing file by name in the Chats folder
 */
async function findFileByName(
  accessToken: string,
  folderId: string,
  fileName: string,
): Promise<{ id: string; name: string } | null> {
  const query = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query,
  )}&fields=files(id,name,modifiedTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  if (json.files && json.files.length > 0) {
    return json.files[0];
  }
  return null;
}

/**
 * Save / Overwrite chat_<sessionId>.json in the Chats folder.
 * Supports both Google Shared Drives (media upload) and My Drive (metadata/description storage).
 */
async function saveChatToDrive(
  accessToken: string,
  folderId: string,
  sessionId: string,
  chatPayload: Record<string, unknown>,
) {
  const fileName = `chat_${sessionId}.json`;
  const existingFile = await findFileByName(accessToken, folderId, fileName);
  const jsonString = JSON.stringify(chatPayload, null, 2);
  const jsonBytes = new TextEncoder().encode(jsonString);

  if (existingFile) {
    // 1. Try PATCH media upload (works if in Shared Drive or quota available)
    try {
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media&supportsAllDrives=true`;
      const updateRes = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "Content-Length": String(jsonBytes.length),
        },
        body: jsonBytes,
      });

      if (updateRes.ok) {
        const updated = await updateRes.json();
        return {
          action: "updated",
          fileId: existingFile.id,
          fileName,
          sessionId,
          storageType: "drive_media",
          details: updated,
        };
      }
    } catch {
      // ignore, fallback to metadata update
    }

    // 2. Fallback: Update description & properties on existing file (bypasses service account 0-quota limit)
    const patchMeta = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existingFile.id}?supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: jsonString,
          properties: {
            sessionId,
            updatedAt: String(chatPayload.updatedAt || new Date().toISOString()),
            messageCount: String(
              Array.isArray(chatPayload.messages) ? chatPayload.messages.length : 0,
            ),
          },
        }),
      },
    );

    if (!patchMeta.ok) {
      const err = await patchMeta.text();
      throw new Error(`Failed to update chat file (${patchMeta.status}): ${err}`);
    }

    const updated = await patchMeta.json();
    return {
      action: "updated",
      fileId: existingFile.id,
      fileName,
      sessionId,
      storageType: "drive_metadata",
      details: updated,
    };
  }

  // New file: Try multipart media creation first
  try {
    const boundary = `-------314159265358979323846`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
      description: jsonString,
      properties: {
        sessionId,
        updatedAt: String(chatPayload.updatedAt || new Date().toISOString()),
        messageCount: String(Array.isArray(chatPayload.messages) ? chatPayload.messages.length : 0),
      },
    };

    const metaHeader = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata,
    )}`;
    const mediaHeader = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n`;

    const metaBytes = new TextEncoder().encode(metaHeader);
    const mediaHeaderBytes = new TextEncoder().encode(mediaHeader);
    const closeBytes = new TextEncoder().encode(closeDelimiter);

    const totalLength =
      metaBytes.length + mediaHeaderBytes.length + jsonBytes.length + closeBytes.length;
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    combined.set(metaBytes, offset);
    offset += metaBytes.length;

    combined.set(mediaHeaderBytes, offset);
    offset += mediaHeaderBytes.length;

    combined.set(jsonBytes, offset);
    offset += jsonBytes.length;

    combined.set(closeBytes, offset);

    const createUrl =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,createdTime,modifiedTime";

    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(totalLength),
      },
      body: combined,
    });

    if (createRes.ok) {
      const created = await createRes.json();
      return {
        action: "created",
        fileId: created.id,
        fileName,
        sessionId,
        storageType: "drive_media",
        details: created,
      };
    }
  } catch {
    // fallback
  }

  // If multipart failed (e.g. personal drive 0-quota error), create file with description metadata
  const createMetaRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: "application/json",
        description: jsonString,
        properties: {
          sessionId,
          updatedAt: String(chatPayload.updatedAt || new Date().toISOString()),
          messageCount: String(
            Array.isArray(chatPayload.messages) ? chatPayload.messages.length : 0,
          ),
        },
      }),
    },
  );

  if (!createMetaRes.ok) {
    const err = await createMetaRes.text();
    throw new Error(`Failed to create chat file (${createMetaRes.status}): ${err}`);
  }

  const created = await createMetaRes.json();
  return {
    action: "created",
    fileId: created.id,
    fileName,
    sessionId,
    storageType: "drive_metadata",
    details: created,
  };
}

/**
 * Fetch and download chat_<sessionId>.json from Chats folder
 */
async function fetchChatFromDrive(accessToken: string, folderId: string, sessionId: string) {
  const fileName = `chat_${sessionId}.json`;
  const file = await findFileByName(accessToken, folderId, fileName);

  if (!file) {
    return { ok: false, error: `Chat session '${sessionId}' not found in Drive.` };
  }

  // 1. Check if file has description containing the chat JSON
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?fields=id,name,description,properties,size,createdTime,modifiedTime&supportsAllDrives=true`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (metaRes.ok) {
    const fileMeta = (await metaRes.json()) as {
      description?: string;
      properties?: Record<string, string>;
      createdTime?: string;
      modifiedTime?: string;
    };

    if (fileMeta.description) {
      try {
        const parsed = JSON.parse(fileMeta.description);
        if (parsed && (parsed.messages || parsed.sessionId)) {
          return {
            ok: true,
            fileId: file.id,
            fileName,
            sessionId,
            storageType: "drive_metadata",
            data: parsed,
          };
        }
      } catch {
        // continue to try alt=media
      }
    }
  }

  // 2. Try downloading raw file content via alt=media
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
  const downloadRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (downloadRes.ok) {
    const text = await downloadRes.text();
    if (text.trim().startsWith("{")) {
      try {
        const chatData = JSON.parse(text);
        return {
          ok: true,
          fileId: file.id,
          fileName,
          sessionId,
          storageType: "drive_media",
          data: chatData,
        };
      } catch {
        // ignore
      }
    }
  }

  return { ok: false, error: "Unable to parse chat data from Google Drive file." };
}

/**
 * List all chat files from the Chats folder
 */
async function listAllChatsFromDrive(accessToken: string, folderId: string) {
  const query = `'${folderId}' in parents and name contains 'chat_' and mimeType = 'application/json' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query,
  )}&fields=files(id,name,size,createdTime,modifiedTime)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list chats (${res.status}): ${err}`);
  }

  const json = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      size?: string;
      createdTime?: string;
      modifiedTime?: string;
    }>;
  };

  const chats = (json.files || []).map((f) => {
    const sessionId = f.name.replace(/^chat_|\.json$/g, "");
    return {
      fileId: f.id,
      fileName: f.name,
      sessionId,
      size: f.size,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
    };
  });

  return { ok: true, count: chats.length, chats };
}

/**
 * Delete chat file from Drive
 */
async function deleteChatFromDrive(accessToken: string, folderId: string, sessionId: string) {
  const fileName = `chat_${sessionId}.json`;
  const file = await findFileByName(accessToken, folderId, fileName);

  if (!file) {
    return { ok: true, message: "Chat file did not exist or already deleted." };
  }

  const delRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!delRes.ok) {
    const err = await delRes.text();
    throw new Error(`Failed to delete chat file (${delRes.status}): ${err}`);
  }

  return { ok: true, deletedFileId: file.id, sessionId };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  try {
    const accessToken = await getGoogleDriveAccessToken();
    const chatsFolderId = await getOrCreateChatsFolder(accessToken);

    // =========================================================================
    // GET: Fetch / Restore Chat, or List Chats
    // =========================================================================
    if (req.method === "GET") {
      const sessionId = url.searchParams.get("sessionId");
      const action = url.searchParams.get("action") || "";

      // List all archived chats
      if (action === "list" || (!sessionId && action !== "restore")) {
        const listResult = await listAllChatsFromDrive(accessToken, chatsFolderId);
        return new Response(JSON.stringify(listResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch single chat by sessionId
      if (sessionId) {
        const chatResult = await fetchChatFromDrive(accessToken, chatsFolderId, sessionId);
        const status = chatResult.ok ? 200 : 404;
        return new Response(JSON.stringify(chatResult), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Missing 'sessionId' parameter for GET /chat-sync.");
    }

    // =========================================================================
    // POST: Live Sync / Final Sync / Restore / Delete
    // =========================================================================
    if (req.method === "POST") {
      const body = await req.json();
      const action = (body.action || "sync").toLowerCase();

      // Action: Restore
      if (action === "restore" || action === "fetch") {
        const sessionId = body.sessionId;
        if (!sessionId) throw new Error("Missing 'sessionId' in restore request.");
        const chatResult = await fetchChatFromDrive(accessToken, chatsFolderId, sessionId);
        const status = chatResult.ok ? 200 : 404;
        return new Response(JSON.stringify(chatResult), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Action: Inspect folder details
      if (action === "inspect_folder") {
        const folderRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${chatsFolderId}?fields=id,name,driveId,owners,sharedWithMeTime,capabilities,shared&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const folderData = await folderRes.json();

        return new Response(JSON.stringify({ ok: true, chatsFolderId, folderData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Action: List
      if (action === "list") {
        const listResult = await listAllChatsFromDrive(accessToken, chatsFolderId);
        return new Response(JSON.stringify(listResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Action: Delete
      if (action === "delete") {
        const sessionId = body.sessionId;
        if (!sessionId) throw new Error("Missing 'sessionId' in delete request.");
        const delResult = await deleteChatFromDrive(accessToken, chatsFolderId, sessionId);
        return new Response(JSON.stringify(delResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Action: Sync (Live Sync or Final Archive Sync)
      const sessionId = body.sessionId;
      if (!sessionId) throw new Error("Missing 'sessionId' in chat sync payload.");

      // Normalize format to specified JSON Schema:
      // { "sessionId": string, "updatedAt": string, "messages": Array<{ id: string, role: string, content: string, timestamp: string }> }
      const messages = Array.isArray(body.messages)
        ? body.messages.map((m: Record<string, unknown>) => ({
            id: String(m.id || Date.now().toString(36)),
            role: String(m.role || "user"),
            content: String(m.content || m.text || ""),
            timestamp: m.timestamp
              ? String(m.timestamp)
              : typeof m.at === "number"
                ? new Date(m.at).toISOString()
                : new Date().toISOString(),
            mediaType: m.mediaType,
            imageUrl: m.imageUrl,
            videoUrl: m.videoUrl,
            audioUrl: m.audioUrl,
            modelName: m.modelName,
            attachmentUrl: m.attachmentUrl,
          }))
        : [];

      const chatPayload = {
        sessionId,
        title: body.title || "Conversation",
        model: body.model || "copilot-flash",
        updatedAt: body.updatedAt || new Date().toISOString(),
        messages,
      };

      const syncResult = await saveChatToDrive(accessToken, chatsFolderId, sessionId, chatPayload);

      return new Response(
        JSON.stringify({
          ok: true,
          ...syncResult,
          updatedAt: chatPayload.updatedAt,
          messageCount: messages.length,
          folderId: chatsFolderId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // DELETE: Remove chat by sessionId
    // =========================================================================
    if (req.method === "DELETE") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) throw new Error("Missing 'sessionId' parameter for DELETE /chat-sync.");

      const delResult = await deleteChatFromDrive(accessToken, chatsFolderId, sessionId);
      return new Response(JSON.stringify(delResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
