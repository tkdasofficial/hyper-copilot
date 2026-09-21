import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config";

export interface DriveStorageInfo {
  limitBytes: number;
  usageBytes: number;
  usageInDriveBytes: number;
  usageInTrashBytes: number;
  freeBytes: number;
  usagePercent: number;
  limitFormatted: string;
  usageFormatted: string;
  freeFormatted: string;
  isNearFull: boolean;
  warning?: string;
  user?: { displayName?: string; emailAddress?: string };
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  directDownloadUrl?: string;
  createdTime?: string;
}

export type DriveSubfolder = "Images" | "Videos" | "Audios" | "Files" | "all";

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/upload-to-drive`;

/**
 * Upload a binary File, base64 string, or remote URL to Google Drive.
 * Automatically routes to the matching subfolder (Images, Videos, Audios, Files).
 */
export async function uploadToDrive(options: {
  file?: File;
  base64Data?: string;
  dataUrl?: string;
  fileUrl?: string;
  filename?: string;
  mimeType?: string;
  folder?: "Images" | "Videos" | "Audios" | "Files" | string;
  makePublic?: boolean;
}): Promise<{
  ok: boolean;
  folder?: string;
  file?: DriveFileItem;
  error?: string;
}> {
  try {
    // 1. Multipart file upload
    if (options.file) {
      const formData = new FormData();
      formData.append("file", options.file);
      if (options.folder) formData.append("folder", options.folder);

      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      return await res.json();
    }

    // 2. JSON upload (URL or Base64)
    const payload = {
      action: options.fileUrl ? "upload-from-url" : "upload",
      fileUrl: options.fileUrl,
      base64Data: options.base64Data,
      dataUrl: options.dataUrl,
      filename: options.filename,
      mimeType: options.mimeType,
      folder: options.folder,
      makePublic: options.makePublic ?? true,
    };

    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * List files from Google Drive (filter by subfolder or get all)
 */
export async function fetchDriveFiles(options?: {
  folder?: DriveSubfolder;
  limit?: number;
  pageToken?: string;
  search?: string;
}): Promise<{
  ok: boolean;
  folder?: string;
  files?: DriveFileItem[];
  nextPageToken?: string;
  error?: string;
}> {
  try {
    const url = new URL(EDGE_FUNCTION_URL);
    url.searchParams.set("action", "list");
    if (options?.folder) url.searchParams.set("folder", options.folder);
    if (options?.limit) url.searchParams.set("limit", String(options.limit));
    if (options?.pageToken) url.searchParams.set("pageToken", options.pageToken);
    if (options?.search) url.searchParams.set("search", options.search);

    const res = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check 15GB storage quota and usage breakdown
 */
export async function fetchDriveStorage(): Promise<{
  ok: boolean;
  limitFormatted?: string;
  usageFormatted?: string;
  freeFormatted?: string;
  usagePercent?: number;
  isNearFull?: boolean;
  warning?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}?action=storage`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Delete a specific file from Google Drive
 */
export async function deleteDriveFile(fileId: string): Promise<{
  ok: boolean;
  deletedFileId?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}?fileId=${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run Auto-Delete to clean up files older than N days or free up quota
 */
export async function autoDeleteDriveFiles(options?: {
  olderThanDays?: number;
  folder?: string;
  maxStoragePercent?: number;
  emptyTrashAfter?: boolean;
}): Promise<{
  ok: boolean;
  deletedCount?: number;
  freedBytes?: number;
  freedFormatted?: string;
  deletedFiles?: Array<{ id: string; name: string; size?: string }>;
  error?: string;
}> {
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: "auto-delete",
        olderThanDays: options?.olderThanDays ?? 30,
        folder: options?.folder,
        maxStoragePercent: options?.maxStoragePercent,
        emptyTrashAfter: options?.emptyTrashAfter ?? true,
      }),
    });

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Empty trash to reclaim 15GB storage space
 */
export async function emptyDriveTrash(): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: "empty-trash" }),
    });

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export {
  syncChatToDrive,
  fetchChatFromDrive,
  restoreChatSession,
  terminateAndPurgeSession,
  deleteChatFromDrive,
  listDriveArchivedChats,
  useChatSyncEngine,
  type DriveChatPayload,
  type DriveChatMessage,
} from "@/lib/copilot-sync";
