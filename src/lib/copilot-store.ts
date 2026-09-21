import { executeCopilotApi, pollVideoStatus, type CopilotActionType } from "@/lib/copilot-api";

export type CopilotRole = "user" | "assistant";

export type CopilotMessage = {
  id: string;
  role: CopilotRole;
  text: string;
  at: number;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  mediaType?: "text" | "image" | "video" | "audio";
  modelName?: string;
  error?: string;
  attachmentUrl?: string;
  requestId?: string;
  videoStatus?: string;
};

export type CopilotConversation = {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: CopilotMessage[];
  archivedToDrive?: boolean;
  isCachedLocally?: boolean;
  syncStatus?: "synced" | "syncing" | "idle" | "error";
  lastSyncedAt?: number;
};

export const COPILOT_MODELS = [
  {
    id: "copilot-speed",
    label: "Copilot Speed",
    detail: "Fast everyday conversations",
  },
  {
    id: "copilot-flash",
    label: "Copilot Flash",
    detail: "Multimodal text, image & audio",
  },
  {
    id: "copilot-heavy",
    label: "Copilot Heavy",
    detail: "Advanced reasoning & video",
  },
];

const STORAGE_KEY = "hyper:copilot:chats";

type State = {
  chats: CopilotConversation[];
  pendingChatId: string | null;
};

let state: State = { chats: [], pendingChatId: null };
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CopilotConversation[];
      if (Array.isArray(parsed)) state = { ...state, chats: parsed };
    }
  } catch {
    /* ignore unreadable storage */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chats));
  } catch {
    /* ignore quota errors */
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Partial<State>, save = true) {
  state = { ...state, ...next };
  if (save) persist();
  emit();
}

export function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): State {
  hydrate();
  return state;
}

export function getServerSnapshot(): State {
  return { chats: [], pendingChatId: null };
}

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function titleFrom(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 44 ? `${clean.slice(0, 44)}…` : clean || "New chat";
}

export function normalizeModel(modelId?: string): string {
  if (!modelId) return "copilot-flash";
  if (modelId === "speed" || modelId === "copilot-speed") return "copilot-speed";
  if (modelId === "flash" || modelId === "copilot-flash") return "copilot-flash";
  if (
    modelId === "heavy" ||
    modelId === "copilot-heavy" ||
    modelId === "nvidia-nemotron" ||
    modelId === "pixazo-ltx"
  ) {
    return "copilot-heavy";
  }
  if (modelId === "pixazo-flux" || modelId === "pixazo-inpainting") {
    return "copilot-flash";
  }
  const found = COPILOT_MODELS.find((m) => m.id === modelId);
  return found ? found.id : "copilot-flash";
}

export function createChat(model: string = "copilot-flash"): string {
  hydrate();
  const normalized = normalizeModel(model);
  const now = Date.now();
  const chat: CopilotConversation = {
    id: makeId(),
    title: "New chat",
    model: normalized,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  setState({ chats: [chat, ...state.chats] });
  return chat.id;
}

export function deleteChat(id: string) {
  hydrate();
  setState({ chats: state.chats.filter((chat) => chat.id !== id) });
}

export function clearChats() {
  hydrate();
  setState({ chats: [] });
}

/**
 * Rehydrate a chat session with messages fetched dynamically from Google Drive
 */
export function rehydrateChat(
  chatId: string,
  messages: CopilotMessage[],
  meta?: { title?: string; model?: string; updatedAt?: number },
) {
  hydrate();
  const existing = state.chats.find((c) => c.id === chatId);
  if (existing) {
    setState({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages,
              title: meta?.title || c.title,
              model: meta?.model || c.model,
              updatedAt: meta?.updatedAt || c.updatedAt,
              isCachedLocally: true,
              archivedToDrive: true,
              syncStatus: "synced",
              lastSyncedAt: Date.now(),
            }
          : c,
      ),
    });
  } else {
    // Session wasn't in state, add it
    const now = meta?.updatedAt || Date.now();
    const newChat: CopilotConversation = {
      id: chatId,
      title: meta?.title || "Archived chat",
      model: normalizeModel(meta?.model),
      createdAt: now,
      updatedAt: now,
      messages,
      isCachedLocally: true,
      archivedToDrive: true,
      syncStatus: "synced",
      lastSyncedAt: Date.now(),
    };
    setState({ chats: [newChat, ...state.chats] });
  }
}

/**
 * Purge local messages cache for an archived session (keeps header/metadata)
 */
export function purgeChatCache(chatId: string) {
  hydrate();
  setState({
    chats: state.chats.map((c) =>
      c.id === chatId
        ? {
            ...c,
            messages: [], // Clear heavy message array from local storage
            isCachedLocally: false,
            archivedToDrive: true,
            syncStatus: "synced",
          }
        : c,
    ),
  });
}

/**
 * Update sync status for a chat session
 */
export function setChatSyncState(
  chatId: string,
  syncStatus: "synced" | "syncing" | "idle" | "error",
  lastSyncedAt?: number,
) {
  hydrate();
  setState(
    {
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              syncStatus,
              lastSyncedAt: lastSyncedAt ?? c.lastSyncedAt,
              archivedToDrive: syncStatus === "synced" ? true : c.archivedToDrive,
            }
          : c,
      ),
    },
    false,
  );
}

function appendAssistantMessage(chatId: string, message: CopilotMessage) {
  setState({
    chats: state.chats.map((c) =>
      c.id === chatId
        ? {
            ...c,
            updatedAt: Date.now(),
            messages: [...c.messages, message],
          }
        : c,
    ),
  });
}

function updateMessageStatus(chatId: string, messageId: string, updates: Partial<CopilotMessage>) {
  setState({
    chats: state.chats.map((c) =>
      c.id === chatId
        ? {
            ...c,
            updatedAt: Date.now(),
            messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
          }
        : c,
    ),
  });
}

/**
 * Detect user intent flexibly without hijacking regular questions
 * that happen to contain words like "speak", "draw", "video", "picture", etc.
 */
export function detectCopilotIntent(
  prompt: string,
  attachmentUrl?: string,
): {
  action: CopilotActionType;
  cleanPrompt: string;
  displayCaption?: string;
} {
  const trimmed = prompt.trim();

  // 1. Explicit Slash Commands
  if (/^\/(image|img|draw|art)\b/i.test(trimmed)) {
    const clean = trimmed.replace(/^\/(image|img|draw|art)\s*/i, "").trim();
    return {
      action: "text-to-image",
      cleanPrompt: clean,
      displayCaption: clean ? `Generated image for "${clean}"` : "Generated image",
    };
  }

  if (/^\/(video|clip)\b/i.test(trimmed)) {
    const clean = trimmed.replace(/^\/(video|clip)\s*/i, "").trim();
    return {
      action: "image-to-video",
      cleanPrompt: clean,
      displayCaption: clean ? `Rendered video for "${clean}"` : "Rendered video",
    };
  }

  if (/^\/(audio|tts|voice|speech)\b/i.test(trimmed)) {
    const clean = trimmed.replace(/^\/(audio|tts|voice|speech)\s*/i, "").trim();
    return {
      action: "text-to-audio",
      cleanPrompt: clean,
      displayCaption: clean ? `Generated audio for "${clean}"` : "Generated audio",
    };
  }

  // 2. Attached image analysis
  if (
    attachmentUrl &&
    !/^(?:please\s+)?(?:generate|create|render|make)\s+(?:an?\s+)?(?:video|animation)/i.test(
      trimmed,
    )
  ) {
    return {
      action: "image-analyse",
      cleanPrompt: trimmed,
    };
  }

  // 3. Strict Natural Language Media Commands (only if user explicitly commands media asset generation)
  const imageGenMatch = trimmed.match(
    /^(?:please\s+)?(?:generate|create|render|paint|produce)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|wallpaper)\s+(?:of|for|showing|depicting)\s+(.+)$/i,
  );
  if (imageGenMatch && imageGenMatch[1]) {
    const subject = imageGenMatch[1].trim();
    return {
      action: "text-to-image",
      cleanPrompt: subject,
      displayCaption: `Generated image for "${subject}"`,
    };
  }

  const videoGenMatch = trimmed.match(
    /^(?:please\s+)?(?:generate|create|render|produce|make)\s+(?:an?\s+)?(?:video|animation|cinematic video|motion video)\s+(?:of|for|showing|depicting)\s+(.+)$/i,
  );
  if (videoGenMatch && videoGenMatch[1]) {
    const subject = videoGenMatch[1].trim();
    return {
      action: "image-to-video",
      cleanPrompt: subject,
      displayCaption: `Rendered video for "${subject}"`,
    };
  }

  const audioGenMatch = trimmed.match(
    /^(?:please\s+)?(?:generate|create|synthesize|produce)\s+(?:an?\s+)?(?:audio|speech|voiceover|voice clip|spoken audio)\s+(?:of|for|reading|saying)\s+(.+)$/i,
  );
  if (audioGenMatch && audioGenMatch[1]) {
    const subject = audioGenMatch[1].trim();
    return {
      action: "text-to-audio",
      cleanPrompt: subject,
      displayCaption: `Generated audio for "${subject}"`,
    };
  }

  // 4. Default to Conversational Text Chat
  // Regular questions like "can you speak French?", "draw a comparison...", "explain Brownian motion", "write a video script"
  // will ALL go to flexible AI chat text routing!
  return {
    action: "text",
    cleanPrompt: trimmed.replace(/^\/(chat|ask)\s*/i, "").trim(),
  };
}

async function dispatchCopilotCall(
  chatId: string,
  prompt: string,
  model: string,
  attachmentUrl?: string,
) {
  const normalized = normalizeModel(model);
  const modelTier: "speed" | "flash" | "heavy" =
    normalized === "copilot-speed" ? "speed" : normalized === "copilot-heavy" ? "heavy" : "flash";

  // Intelligently detect action without falsely hijacking regular conversation
  const intent = detectCopilotIntent(prompt, attachmentUrl);
  let action: CopilotActionType = intent.action;

  // If on copilot-speed tier, keep purely text for maximum speed
  if (normalized === "copilot-speed" && action !== "image-analyse") {
    action = "text";
  }

  const currentChat = state.chats.find((c) => c.id === chatId);
  const historyMessages = (currentChat?.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.text }));

  try {
    const result = await executeCopilotApi({
      action,
      modelTier,
      prompt: intent.cleanPrompt || prompt,
      messages: historyMessages,
      imageUrl: attachmentUrl,
    });

    if (!result.ok) {
      throw new Error(result.error || "Copilot generation request failed.");
    }

    if (result.type === "audio" && result.audioUrl) {
      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: "assistant",
        text: intent.displayCaption || `Generated audio for: "${intent.cleanPrompt || prompt}"`,
        audioUrl: result.audioUrl,
        mediaType: "audio",
        modelName: "Copilot Voice",
        at: Date.now(),
      };
      appendAssistantMessage(chatId, assistantMsg);
    } else if (result.type === "image" && result.imageUrl) {
      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: "assistant",
        text: intent.displayCaption || `Generated image for: "${intent.cleanPrompt || prompt}"`,
        imageUrl: result.imageUrl,
        mediaType: "image",
        modelName: "Copilot Image",
        at: Date.now(),
      };
      appendAssistantMessage(chatId, assistantMsg);
    } else if (result.type === "video") {
      const reqId = result.requestId;
      const initialMsg: CopilotMessage = {
        id: makeId(),
        role: "assistant",
        text: `Rendering video: "${intent.cleanPrompt || prompt}"`,
        mediaType: "video",
        modelName: "Copilot Video",
        requestId: reqId,
        videoStatus: result.status || "PROCESSING",
        at: Date.now(),
      };
      appendAssistantMessage(chatId, initialMsg);

      if (reqId) {
        void pollVideoStatus(reqId, (status) => {
          updateMessageStatus(chatId, initialMsg.id, { videoStatus: status });
        }).then((pollRes) => {
          if (pollRes.status === "COMPLETED" && pollRes.videoUrl) {
            updateMessageStatus(chatId, initialMsg.id, {
              videoUrl: pollRes.videoUrl,
              videoStatus: "COMPLETED",
              text: intent.displayCaption || `Rendered video for "${intent.cleanPrompt || prompt}"`,
            });
          } else if (pollRes.error) {
            updateMessageStatus(chatId, initialMsg.id, {
              videoStatus: "FAILED",
              error: pollRes.error,
              text: `Video error: ${pollRes.error}`,
            });
          }
        });
      }
    } else {
      const replyText = result.text || "No response received.";
      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: "assistant",
        text: replyText,
        mediaType: "text",
        modelName:
          modelTier === "speed"
            ? "Copilot Speed"
            : modelTier === "flash"
              ? "Copilot Flash"
              : "Copilot Heavy",
        at: Date.now(),
      };
      appendAssistantMessage(chatId, assistantMsg);
    }
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    const assistantMsg: CopilotMessage = {
      id: makeId(),
      role: "assistant",
      text: `Error: ${errorText}`,
      error: errorText,
      at: Date.now(),
    };
    appendAssistantMessage(chatId, assistantMsg);
  } finally {
    setState({
      pendingChatId: state.pendingChatId === chatId ? null : state.pendingChatId,
    });
  }
}

/**
 * Regenerate or replace the last assistant response in a chat
 */
export function regenerateLastResponse(chatId: string) {
  hydrate();
  const currentChat = state.chats.find((c) => c.id === chatId);
  if (!currentChat || currentChat.messages.length === 0) return;

  // Find the last user message
  const lastUserMsgIndex = currentChat.messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserMsgIndex === -1) return;

  const lastUserMsg = currentChat.messages[lastUserMsgIndex];
  // Trim conversation so the previous assistant answer is removed
  const trimmedMessages = currentChat.messages.slice(0, lastUserMsgIndex + 1);

  setState({
    chats: state.chats.map((c) =>
      c.id === chatId
        ? {
            ...c,
            updatedAt: Date.now(),
            messages: trimmedMessages,
          }
        : c,
    ),
    pendingChatId: chatId,
  });

  void dispatchCopilotCall(chatId, lastUserMsg.text, currentChat.model, lastUserMsg.attachmentUrl);
}

export function createAndSendMessage(
  prompt: string,
  model: string = "copilot-flash",
  attachmentUrl?: string,
): string {
  hydrate();
  const text = prompt.trim();
  const normalized = normalizeModel(model);
  const now = Date.now();
  const chatId = makeId();
  const userMessage: CopilotMessage = {
    id: makeId(),
    role: "user",
    text,
    at: now,
    attachmentUrl,
  };
  const chat: CopilotConversation = {
    id: chatId,
    title: titleFrom(text || "New conversation"),
    model: normalized,
    createdAt: now,
    updatedAt: now,
    messages: text || attachmentUrl ? [userMessage] : [],
  };
  setState({ chats: [chat, ...state.chats], pendingChatId: text || attachmentUrl ? chatId : null });

  if (text || attachmentUrl) {
    void dispatchCopilotCall(chatId, text, normalized, attachmentUrl);
  }

  return chatId;
}

export function sendMessage(
  chatId: string,
  prompt: string,
  model: string = "copilot-flash",
  attachmentUrl?: string,
) {
  hydrate();
  const text = prompt.trim();
  if (!text && !attachmentUrl) return;
  const normalized = normalizeModel(model);
  const now = Date.now();
  const userMessage: CopilotMessage = {
    id: makeId(),
    role: "user",
    text,
    at: now,
    attachmentUrl,
  };

  const exists = state.chats.some((chat) => chat.id === chatId);
  let chats: CopilotConversation[];
  if (!exists) {
    const newChat: CopilotConversation = {
      id: chatId,
      title: titleFrom(text || "New conversation"),
      model: normalized,
      createdAt: now,
      updatedAt: now,
      messages: [userMessage],
    };
    chats = [newChat, ...state.chats];
  } else {
    chats = state.chats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            model: normalized,
            title: chat.messages.length === 0 ? titleFrom(text || "Conversation") : chat.title,
            updatedAt: now,
            messages: [...chat.messages, userMessage],
          }
        : chat,
    );
  }
  setState({ chats, pendingChatId: chatId });

  void dispatchCopilotCall(chatId, text, normalized, attachmentUrl);
}
