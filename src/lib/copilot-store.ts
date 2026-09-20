import { executeCopilotApi, pollVideoStatus } from "@/lib/copilot-api";

export type CopilotRole = "user" | "assistant";

export type CopilotMessage = {
  id: string;
  role: CopilotRole;
  text: string;
  at: number;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: "text" | "image" | "video";
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
};

export const COPILOT_MODELS = [
  {
    id: "nvidia-nemotron",
    label: "Nvidia Nemotron 3 Ultra",
    detail: "Text-To-Text (550b)",
    category: "text",
  },
  {
    id: "pixazo-flux",
    label: "Flux 1 Schnell",
    detail: "Text-To-Image (FREE)",
    category: "image",
  },
  {
    id: "pixazo-inpainting",
    label: "SD Inpainting",
    detail: "Image-To-Image (FREE)",
    category: "image-to-image",
  },
  {
    id: "pixazo-ltx",
    label: "LTX 2.5",
    detail: "Image-To-Video (FREE)",
    category: "video",
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
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean || "New chat";
}

function normalizeModel(modelId?: string): string {
  if (!modelId) return "nvidia-nemotron";
  if (modelId === "speed" || modelId === "flash" || modelId === "heavy") {
    return "nvidia-nemotron";
  }
  const found = COPILOT_MODELS.find((m) => m.id === modelId);
  return found ? found.id : "nvidia-nemotron";
}

export function createChat(model: string = "nvidia-nemotron"): string {
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

async function dispatchCopilotCall(
  chatId: string,
  prompt: string,
  model: string,
  attachmentUrl?: string,
) {
  const normalized = normalizeModel(model);

  // Determine the appropriate API action
  let action: "text" | "text-to-image" | "image-to-image" | "image-to-video" = "text";
  if (normalized === "pixazo-flux") {
    action = "text-to-image";
  } else if (normalized === "pixazo-inpainting") {
    action = "image-to-image";
  } else if (normalized === "pixazo-ltx") {
    action = "image-to-video";
  } else if (attachmentUrl && /video|animate|motion|cinematic|moving/i.test(prompt)) {
    action = "image-to-video";
  } else if (attachmentUrl && /edit|inpaint|modify|change|restyle|recolor/i.test(prompt)) {
    action = "image-to-image";
  } else if (
    /^\/image\b|generate image|draw|render image|picture of/i.test(prompt) &&
    !attachmentUrl
  ) {
    action = "text-to-image";
  }

  // Conversation history for context if text
  const currentChat = state.chats.find((c) => c.id === chatId);
  const historyMessages = (currentChat?.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.text }));

  try {
    const result = await executeCopilotApi({
      action,
      prompt,
      messages: historyMessages,
      imageUrl: attachmentUrl,
    });

    if (!result.ok) {
      throw new Error(result.error || "Copilot generation request failed.");
    }

    if (result.type === "image" && result.imageUrl) {
      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: "assistant",
        text: prompt,
        imageUrl: result.imageUrl,
        mediaType: "image",
        modelName:
          result.model ||
          (action === "image-to-image"
            ? "Pixazo Stable Diffusion Inpainting (Free)"
            : "Pixazo Flux 1 Schnell (Free)"),
        at: Date.now(),
      };
      appendAssistantMessage(chatId, assistantMsg);
    } else if (result.type === "video") {
      const reqId = result.requestId;
      const initialMsg: CopilotMessage = {
        id: makeId(),
        role: "assistant",
        text: prompt ? `Rendering video: "${prompt}"` : "Rendering video...",
        mediaType: "video",
        modelName: "Pixazo LTX 2.5 (Free)",
        requestId: reqId,
        videoStatus: result.status || "PROCESSING",
        at: Date.now(),
      };
      appendAssistantMessage(chatId, initialMsg);

      if (reqId) {
        // Poll for video generation completion
        void pollVideoStatus(reqId, (status) => {
          updateMessageStatus(chatId, initialMsg.id, { videoStatus: status });
        }).then((pollRes) => {
          if (pollRes.status === "COMPLETED" && pollRes.videoUrl) {
            updateMessageStatus(chatId, initialMsg.id, {
              videoUrl: pollRes.videoUrl,
              videoStatus: "COMPLETED",
              text: `Rendered with Pixazo LTX 2.5 (Free)`,
            });
          } else if (pollRes.error) {
            updateMessageStatus(chatId, initialMsg.id, {
              videoStatus: "FAILED",
              error: pollRes.error,
              text: `Video generation error: ${pollRes.error}`,
            });
          }
        });
      }
    } else {
      // Text response from Nvidia Nemotron 3 Ultra
      const replyText = result.text || "No response received.";
      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: "assistant",
        text: replyText,
        mediaType: "text",
        modelName: result.model || "Nvidia Nemotron 3 Ultra (550b)",
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

export function createAndSendMessage(
  prompt: string,
  model: string = "nvidia-nemotron",
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
  model: string = "nvidia-nemotron",
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
