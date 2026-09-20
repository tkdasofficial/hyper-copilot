import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { pageHead } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { CopilotShell } from "@/components/hyper/CopilotShell";
import { useCopilotStore } from "@/components/hyper/useCopilotStore";
import { deleteChat } from "@/lib/copilot-store";

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

  return (
    <CopilotShell active="history">
      <section className="mx-auto w-full max-w-2xl px-4 pb-20 pt-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[15px] font-bold tracking-[-0.02em]">History</h1>
          <Link
            to="/copilot"
            className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            New chat
          </Link>
        </div>

        {chats.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No chats yet. Start one from the New tab.
          </p>
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
                  <span className="block truncate text-[13px] font-semibold">{chat.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {chat.messages.length} messages · {when(chat.updatedAt)}
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${chat.title}`}
                  onClick={() => deleteChat(chat.id)}
                  className="h-7 w-7 rounded-full text-muted-foreground"
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
