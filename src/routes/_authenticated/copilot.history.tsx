import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud, Loader2, MessageSquare, Plus, RotateCw, Trash2 } from "lucide-react";
import { pageHead } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { CopilotShell } from "@/components/hyper/CopilotShell";
import { useCopilotStore } from "@/components/hyper/useCopilotStore";
import { deleteChat } from "@/lib/copilot-store";
import {
  deleteChatFromDrive,
  listDriveArchivedChats,
  restoreChatSession,
} from "@/lib/copilot-sync";

export const Route = createFileRoute("/_authenticated/copilot/history")({
  head: () =>
    pageHead({
      path: "/copilot/history",
      title: "Chat History \u2014 Hyper Copilot",
      description: "Find and continue an earlier Hyper Copilot conversation.",
      noindex: true,
      keywords: ["Hyper Copilot history"],
    }),
  component: CopilotHistory,
});

function when(at: number) {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CopilotHistory() {
  const { chats } = useCopilotStore();
  const [isScanningDrive, setIsScanningDrive] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleDelete = (chatId: string) => {
    deleteChat(chatId);
    deleteChatFromDrive(chatId).catch(() => {
      // background cleanup
    });
  };

  const handleSyncWithDrive = async () => {
    setIsScanningDrive(true);
    setSyncNotice(null);
    try {
      const result = await listDriveArchivedChats();
      if (result.ok && result.chats && result.chats.length > 0) {
        let restoredCount = 0;
        for (const driveFile of result.chats) {
          const exists = chats.some((c) => c.id === driveFile.sessionId);
          if (!exists) {
            await restoreChatSession(driveFile.sessionId);
            restoredCount++;
          }
        }
        setSyncNotice(
          restoredCount > 0
            ? `Restored ${restoredCount} chat${restoredCount > 1 ? "s" : ""} from Google Drive.`
            : "All Google Drive archived chats are already up to date.",
        );
      } else {
        setSyncNotice("No archived chats found in Google Drive Chats folder.");
      }
    } catch {
      setSyncNotice("Could not connect to Google Drive Chats folder.");
    } finally {
      setIsScanningDrive(false);
      setTimeout(() => setSyncNotice(null), 4000);
    }
  };

  return (
    <CopilotShell active="history">
      <section className="mx-auto w-full max-w-2xl px-4 pb-20 pt-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-bold tracking-[-0.02em]">History</h1>
            <button
              type="button"
              onClick={handleSyncWithDrive}
              disabled={isScanningDrive}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              title="Scan and restore chats archived in Google Drive"
            >
              {isScanningDrive ? (
                <Loader2 className="h-3 w-3 animate-spin text-foreground" />
              ) : (
                <Cloud className="h-3 w-3 text-emerald-500" />
              )}
              <span>Drive Sync</span>
            </button>
          </div>

          <Link
            to="/copilot"
            className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            New chat
          </Link>
        </div>

        {syncNotice ? (
          <div className="mt-3 rounded-lg border border-border/80 bg-surface-2 px-3 py-2 text-[12px] text-foreground transition-all">
            {syncNotice}
          </div>
        ) : null}

        {chats.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              No chats yet. Start one from the New tab.
            </p>
            <button
              type="button"
              onClick={handleSyncWithDrive}
              disabled={isScanningDrive}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface-2 cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Check Google Drive for Archived Chats
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-1.5">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"
              >
                <MessageSquare
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.9}
                />
                <Link to="/copilot/$chatId" params={{ chatId: chat.id }} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="block truncate text-[13px] font-semibold">{chat.title}</span>
                    {chat.archivedToDrive || chat.syncStatus === "synced" ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0"
                        title="Archived to Google Drive /Chats"
                      >
                        <Cloud className="h-2.5 w-2.5" />
                        Drive
                      </span>
                    ) : null}
                  </div>
                  <span className="block text-[11px] text-muted-foreground">
                    {chat.messages.length > 0
                      ? `${chat.messages.length} messages`
                      : "Archived in Drive · Click to restore"}{" "}
                    · {when(chat.updatedAt)}
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${chat.title}`}
                  onClick={() => handleDelete(chat.id)}
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </CopilotShell>
  );
}
