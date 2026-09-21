import { useEffect, useRef, useState, useCallback } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config";
import {
  getSnapshot,
  rehydrateChat,
  purgeChatCache,
  setChatSyncState,
  type CopilotConversation,
  type CopilotMessage,
} from "@/lib/copilot-store";

export interface DriveChatMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  mediaType?: "text" | "image" | "video" | "audio";
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  modelName?: string;
  attachmentUrl?: string;
}

export interface DriveChatPayload {
  sessionId: string;
  title?: string;
  model?: string;
  updatedAt: string;
  messages: DriveChatMessage[];
}

const CHAT_SYNC_URL = `${SUPABASE_URL}/functions/v1/chat-sync`;

/**
 * Format local CopilotConversation into the required Google Drive JSON schema:
 * { "sessionId": string, "updatedAt": string, "messages": Array<{ id: string, role: string, content: string, timestamp: string }> }
 */
export function conversationToDrivePayload(chat: CopilotConversation): DriveChatPayload {
  return {
    sessionId: chat.id,
    title: chat.title,
    model: chat.model,
    updatedAt: new Date(chat.updatedAt || Date.now()).toISOString(),
    messages: (chat.messages || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.text,
      timestamp: new Date(m.at || Date.now()).toISOString(),
      mediaType: m.mediaType,
      imageUrl: m.imageUrl,
      videoUrl: m.videoUrl,
      audioUrl: m.audioUrl,
      modelName: m.modelName,
      attachmentUrl: m.attachmentUrl,
    })),
  };
}

/**
 * Convert DriveChatPayload messages back to local CopilotMessage format
 */
export function drivePayloadToMessages(payload: DriveChatPayload): CopilotMessage[] {
  return (payload.messages || []).map((m) => ({
    id: m.id || `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: m.role === "user" ? "user" : "assistant",
    text: m.content || "",
    at: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
    mediaType: m.mediaType,
    imageUrl: m.imageUrl,
    videoUrl: m.videoUrl,
    audioUrl: m.audioUrl,
    modelName: m.modelName,
    attachmentUrl: m.attachmentUrl,
  }));
}

/**
 * Sync / Save chat conversation JSON to Google Drive (Chats subfolder)
 */
export async function syncChatToDrive(chat: CopilotConversation): Promise<{
  ok: boolean;
  fileId?: string;
  action?: string;
  storageType?: string;
  error?: string;
}> {
  if (!chat || !chat.id) {
    return { ok: false, error: "Invalid conversation." };
  }

  // Avoid creating empty files if chat has no messages yet
  if (!chat.messages || chat.messages.length === 0) {
    return { ok: true, action: "skipped_empty" };
  }

  setChatSyncState(chat.id, "syncing");

  try {
    const payload = conversationToDrivePayload(chat);

    const res = await fetch(CHAT_SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      setChatSyncState(chat.id, "error");
      return { ok: false, error: `Drive sync failed (${res.status}): ${errText}` };
    }

    const data = await res.json();
    setChatSyncState(chat.id, "synced", Date.now());

    return {
      ok: true,
      fileId: data.fileId,
      action: data.action,
      storageType: data.storageType,
    };
  } catch (err) {
    setChatSyncState(chat.id, "error");
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch and rehydrate a chat session from Google Drive
 */
export async function fetchChatFromDrive(sessionId: string): Promise<{
  ok: boolean;
  data?: DriveChatPayload;
  error?: string;
}> {
  try {
    const url = `${CHAT_SYNC_URL}?sessionId=${encodeURIComponent(sessionId)}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Failed to restore chat (${res.status}): ${errText}` };
    }

    const json = await res.json();
    if (!json.ok || !json.data) {
      return { ok: false, error: json.error || "No chat data found on Drive." };
    }

    return { ok: true, data: json.data as DriveChatPayload };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Restore an archived session dynamically from Google Drive into local state
 */
export async function restoreChatSession(sessionId: string): Promise<{
  ok: boolean;
  messagesCount: number;
  error?: string;
}> {
  const result = await fetchChatFromDrive(sessionId);
  if (!result.ok || !result.data) {
    return { ok: false, messagesCount: 0, error: result.error };
  }

  const messages = drivePayloadToMessages(result.data);
  const updatedAt = result.data.updatedAt ? new Date(result.data.updatedAt).getTime() : Date.now();

  rehydrateChat(sessionId, messages, {
    title: result.data.title,
    model: result.data.model,
    updatedAt,
  });

  return { ok: true, messagesCount: messages.length };
}

/**
 * Session Termination & Cache Purging:
 * 1. Upload/Overwrite the file inside Google Drive Chats folder.
 * 2. On 200 OK, automatically purge/clear the temporary local cache for that session ID.
 */
export async function terminateAndPurgeSession(sessionId: string): Promise<{
  ok: boolean;
  purged: boolean;
  error?: string;
}> {
  const currentChats = getSnapshot().chats;
  const chat = currentChats.find((c) => c.id === sessionId);

  if (!chat) {
    return { ok: true, purged: false };
  }

  // If chat has messages, trigger final Drive sync
  if (chat.messages && chat.messages.length > 0) {
    const syncRes = await syncChatToDrive(chat);
    if (!syncRes.ok) {
      return { ok: false, purged: false, error: syncRes.error };
    }

    // 200 OK confirmed: purge local messages cache to free client memory
    purgeChatCache(sessionId);
    return { ok: true, purged: true };
  }

  return { ok: true, purged: false };
}

/**
 * Delete chat file from Google Drive
 */
export async function deleteChatFromDrive(sessionId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const url = `${CHAT_SYNC_URL}?sessionId=${encodeURIComponent(sessionId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * List all archived chats currently residing in Google Drive
 */
export async function listDriveArchivedChats(): Promise<{
  ok: boolean;
  chats?: Array<{
    fileId: string;
    fileName: string;
    sessionId: string;
    size?: string;
    modifiedTime?: string;
  }>;
  error?: string;
}> {
  try {
    const url = `${CHAT_SYNC_URL}?action=list`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err };
    }

    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * State Machine Hook: Handles auto-sync on active chat, cache purging on session close,
 * and dynamic rehydration when restoring past chats.
 */
export function useChatSyncEngine(
  chatId?: string,
  options?: {
    autoSync?: boolean;
    debounceMs?: number;
    purgeOnClose?: boolean;
  },
) {
  const autoSync = options?.autoSync ?? true;
  const debounceMs = options?.debounceMs ?? 2500;
  const purgeOnClose = options?.purgeOnClose ?? false;

  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncMessageCount = useRef<number>(0);

  // 1. Dynamic Rehydration on Load
  useEffect(() => {
    if (!chatId || chatId === "new") return;

    const chat = getSnapshot().chats.find((c) => c.id === chatId);

    // If chat exists in store but messages are empty (purged after archiving)
    // or if the chat is not found in store, attempt restoration from Google Drive
    if (!chat || (chat && chat.messages.length === 0 && chat.archivedToDrive)) {
      setIsRestoring(true);
      setRestoreError(null);
      restoreChatSession(chatId)
        .then((res) => {
          if (!res.ok && res.error) {
            setRestoreError(res.error);
          }
        })
        .finally(() => {
          setIsRestoring(false);
        });
    }
  }, [chatId]);

  // 2. Active Session Background Sync
  const scheduleSync = useCallback(
    (targetChat: CopilotConversation) => {
      if (!autoSync || !targetChat || targetChat.messages.length === 0) return;

      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }

      setSyncStatus("syncing");
      syncTimerRef.current = setTimeout(async () => {
        const res = await syncChatToDrive(targetChat);
        if (res.ok) {
          setSyncStatus("synced");
          setLastSyncedAt(Date.now());
          lastSyncMessageCount.current = targetChat.messages.length;
        } else {
          setSyncStatus("error");
        }
      }, debounceMs);
    },
    [autoSync, debounceMs],
  );

  // Trigger sync when messages change
  const triggerAutoSync = useCallback(
    (targetChat: CopilotConversation) => {
      if (!targetChat || targetChat.messages.length === 0) return;
      if (targetChat.messages.length !== lastSyncMessageCount.current) {
        scheduleSync(targetChat);
      }
    },
    [scheduleSync],
  );

  // Manual immediate sync
  const syncNow = useCallback(
    async (targetChat?: CopilotConversation) => {
      const chat = targetChat || getSnapshot().chats.find((c) => c.id === chatId);
      if (!chat || chat.messages.length === 0) return;

      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }

      setSyncStatus("syncing");
      const res = await syncChatToDrive(chat);
      if (res.ok) {
        setSyncStatus("synced");
        setLastSyncedAt(Date.now());
        lastSyncMessageCount.current = chat.messages.length;
      } else {
        setSyncStatus("error");
      }
      return res;
    },
    [chatId],
  );

  // 3. Session Termination & Cache Purging on Close / Unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }

      if (purgeOnClose && chatId && chatId !== "new") {
        terminateAndPurgeSession(chatId).catch(() => {
          // background cleanup
        });
      }
    };
  }, [chatId, purgeOnClose]);

  return {
    syncStatus,
    lastSyncedAt,
    isRestoring,
    restoreError,
    triggerAutoSync,
    syncNow,
    restoreNow: () =>
      chatId ? restoreChatSession(chatId) : Promise.resolve({ ok: false, messagesCount: 0 }),
    purgeNow: () =>
      chatId ? terminateAndPurgeSession(chatId) : Promise.resolve({ ok: false, purged: false }),
  };
}
