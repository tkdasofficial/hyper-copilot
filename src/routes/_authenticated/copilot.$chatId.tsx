import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  Check,
  Cloud,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { pageHead } from "@/lib/seo";
import { AppIcon } from "@/components/hyper/AppIcon";
import { CopilotShell } from "@/components/hyper/CopilotShell";
import { CopilotComposer } from "@/components/hyper/CopilotComposer";
import { useCopilotStore } from "@/components/hyper/useCopilotStore";
import { COPILOT_MODELS, sendMessage } from "@/lib/copilot-store";
import { useChatSyncEngine } from "@/lib/copilot-sync";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/copilot/$chatId")({
  beforeLoad: ({ params }) => {
    if (params.chatId === "new") {
      throw redirect({ to: "/copilot" });
    }
  },
  head: () =>
    pageHead({
      path: "/copilot",
      title: "Copilot — Hyper Copilot",
      description: "Continue your Hyper Copilot conversation.",
      noindex: true,
      keywords: ["Hyper Copilot chat"],
    }),
  component: CopilotConversationPage,
});

function CopilotConversationPage() {
  const { chatId } = Route.useParams();
  const navigate = useNavigate();
  const { chats, pendingChatId } = useCopilotStore();
  const chat = chats.find((item) => item.id === chatId);
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [model, setModel] = useState(chat?.model ?? COPILOT_MODELS[1]?.id ?? "copilot-flash");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pending = pendingChatId === chatId;

  const {
    syncStatus,
    lastSyncedAt,
    isRestoring,
    restoreError,
    triggerAutoSync,
    syncNow,
    restoreNow,
    purgeNow,
  } = useChatSyncEngine(chatId, { autoSync: true, debounceMs: 2500, purgeOnClose: true });

  // Auto-sync when chat messages change
  useEffect(() => {
    if (chat && chat.messages.length > 0) {
      triggerAutoSync(chat);
    }
  }, [chat?.messages.length, chat, triggerAutoSync]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length, pending]);

  const speakText = (msgId: string, text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speakingId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice =
      voices.find(
        (v) => v.name.includes("Natural") || v.name.includes("Edge") || v.name.includes("Online"),
      ) ?? voices.find((v) => v.lang.startsWith("en"));
    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const run = () => {
    const prompt = value.trim();
    if ((!prompt && !attachment) || pending) return;
    sendMessage(chatId, prompt, model, attachment ?? undefined);
    setValue("");
    setAttachment(null);
  };

  const handleExitAndArchive = async () => {
    await purgeNow();
    navigate({ to: "/copilot/history" });
  };

  return (
    <CopilotShell active="chat" chatId={chatId}>
      <section className="relative flex min-h-[calc(100vh-110px)] flex-col">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-40 pt-4 sm:px-6">
          {/* Top Google Drive Status Bar */}
          {chat ? (
            <div className="flex items-center justify-between border-b border-border/40 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <Link
                  to="/copilot/history"
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  &larr; History
                </Link>
                <span className="text-border">·</span>
                <span className="text-[11.5px] font-medium text-foreground truncate max-w-[170px] sm:max-w-[260px]">
                  {chat.title}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    syncStatus === "syncing"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : syncStatus === "synced"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : syncStatus === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-surface-2 text-muted-foreground",
                  )}
                  title="Synced with Google Drive /Chats"
                >
                  {syncStatus === "syncing" ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Syncing…</span>
                    </>
                  ) : syncStatus === "synced" ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" strokeWidth={2.4} />
                      <span>Drive Synced</span>
                    </>
                  ) : syncStatus === "error" ? (
                    <>
                      <Cloud className="h-3 w-3 text-destructive" />
                      <span>Sync Error</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="h-3 w-3" />
                      <span>Google Drive</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleExitAndArchive}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                  title="Archive to Google Drive and clear local memory cache"
                >
                  Close & Purge
                </button>
              </div>
            </div>
          ) : null}

          {isRestoring ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="relative flex items-center justify-center">
                <AppIcon className="h-12 w-12 rounded-xl" />
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface border border-border shadow-xs">
                  <Loader2 className="h-3 w-3 animate-spin text-foreground" />
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                Restoring conversation from Google Drive…
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Rehydrating chat messages from Google Drive &quot;Chats&quot; folder.
              </p>
            </div>
          ) : restoreError && (!chat || chat.messages.length === 0) ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <Cloud className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                Could not load from Google Drive
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">{restoreError}</p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => restoreNow()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-semibold text-background cursor-pointer"
                >
                  <RotateCw className="h-3 w-3" />
                  Retry Restoration
                </button>
                <Link
                  to="/copilot/history"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12px] font-semibold text-foreground"
                >
                  Back to History
                </Link>
              </div>
            </div>
          ) : !chat ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <AppIcon className="h-12 w-12 rounded-xl" />
              <p className="text-base font-semibold text-foreground">
                This chat is no longer available.
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                It may have been deleted or the link has expired. Start a new conversation anytime.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <Link
                  to="/copilot"
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                  New chat
                </Link>
                <Link
                  to="/copilot/history"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-surface-2"
                >
                  Open history
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-3" aria-live="polite">
              {chat.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex gap-3", message.role === "user" && "justify-end")}
                >
                  {message.role === "assistant" ? (
                    <AppIcon className="mt-0.5 h-7 w-7 rounded-md shrink-0" />
                  ) : null}
                  <div
                    className={cn(
                      "flex flex-col gap-2 max-w-[88%]",
                      message.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    {/* User attachment preview */}
                    {message.attachmentUrl ? (
                      <div className="overflow-hidden rounded-lg border border-border/50 max-w-[240px]">
                        <img
                          src={message.attachmentUrl}
                          alt="Uploaded reference"
                          className="h-auto w-full object-cover rounded-md"
                        />
                      </div>
                    ) : null}

                    {/* Text content */}
                    {message.text ? (
                      <div
                        className={cn(
                          "whitespace-pre-wrap text-[13px] leading-relaxed",
                          message.role === "user"
                            ? "rounded-xl bg-foreground px-3.5 py-2 text-background font-normal"
                            : "text-foreground pt-0.5",
                          message.error && "text-destructive font-medium",
                        )}
                      >
                        {message.text}
                      </div>
                    ) : null}

                    {/* Generated Audio Player */}
                    {message.mediaType === "audio" && message.audioUrl ? (
                      <div className="mt-1 w-full max-w-[380px] rounded-xl border border-border bg-surface p-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[11.5px] font-medium text-foreground flex items-center gap-1.5">
                            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                            Audio response
                          </span>
                          <a
                            href={message.audioUrl}
                            download="copilot-audio.mp3"
                            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                        </div>
                        <audio controls src={message.audioUrl} className="w-full h-8" />
                      </div>
                    ) : null}

                    {/* Generated Image Result */}
                    {message.imageUrl ? (
                      <div className="group relative mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                        <img
                          src={message.imageUrl}
                          alt="Generated result"
                          className="max-h-[420px] w-auto rounded-lg object-contain bg-black/5"
                          loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[11px] font-medium text-white/90">
                            Generated Image
                          </span>
                          <div className="flex items-center gap-1">
                            <a
                              href={message.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full bg-white/20 p-1.5 text-white backdrop-blur hover:bg-white/30 transition-colors"
                              title="Open full size"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={message.imageUrl}
                              download="copilot-generation.png"
                              className="rounded-full bg-white/20 p-1.5 text-white backdrop-blur hover:bg-white/30 transition-colors"
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Generated Video Result */}
                    {message.mediaType === "video" ? (
                      <div className="mt-1 w-full max-w-[440px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm p-1">
                        {message.videoUrl ? (
                          <div className="relative group">
                            <video
                              src={message.videoUrl}
                              controls
                              playsInline
                              className="w-full rounded-lg bg-black"
                            />
                            <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
                              <span className="text-[11px] text-muted-foreground">
                                Rendered video
                              </span>
                              <a
                                href={message.videoUrl}
                                download="copilot-video.mp4"
                                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                              >
                                <Download className="h-3 w-3" />
                                Download
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-6 text-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
                            <p className="text-[12.5px] font-medium text-foreground">
                              Rendering video...
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Status: {message.videoStatus || "PROCESSING"}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Read aloud button for assistant without technical backend info */}
                    {message.role === "assistant" && !message.error ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        {message.text && message.mediaType !== "audio" ? (
                          <button
                            type="button"
                            onClick={() => speakText(message.id, message.text)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                            title={speakingId === message.id ? "Stop audio" : "Read aloud"}
                          >
                            {speakingId === message.id ? (
                              <>
                                <VolumeX className="h-3 w-3 text-destructive" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" />
                                <span>Listen</span>
                              </>
                            )}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {pending ? (
                <div className="flex gap-3">
                  <AppIcon className="mt-0.5 h-7 w-7 rounded-md shrink-0" />
                  <div className="flex items-center gap-1.5 pt-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-200ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-100ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground ml-2">Thinking...</span>
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {chat ? (
          <CopilotComposer
            value={value}
            onValueChange={setValue}
            model={model}
            onModelChange={setModel}
            onSubmit={run}
            pending={pending}
            attachment={attachment}
            onAttachmentChange={setAttachment}
          />
        ) : null}
      </section>
    </CopilotShell>
  );
}
