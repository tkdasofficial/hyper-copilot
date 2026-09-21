import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { cn } from "@/lib/utils";

type Tab = "new" | "chat" | "history";

export function CopilotShell({
  active: _active,
  chatId: _chatId,
  children,
  fullHeight = false,
}: {
  active: Tab;
  chatId?: string;
  children: ReactNode;
  fullHeight?: boolean;
}) {
  const isFull = fullHeight || _active === "chat";

  return (
    <div
      className={cn(
        "w-full max-w-full bg-background",
        isFull
          ? "h-screen max-h-screen overflow-hidden flex flex-col"
          : "min-h-screen overflow-x-hidden",
      )}
    >
      <Sidebar />
      <div
        className={cn(
          "lg:pl-[248px]",
          isFull ? "flex flex-col h-screen max-h-screen overflow-hidden flex-1 min-h-0" : "",
        )}
      >
        <div className="shrink-0 z-30">
          <TopBar />
        </div>
        <main
          className={cn(
            "flex-1 min-h-0",
            isFull ? "flex flex-col overflow-hidden relative" : "overflow-x-hidden",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
