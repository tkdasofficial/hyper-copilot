import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type Tab = "new" | "chat" | "history";

export function CopilotShell({
  active: _active,
  chatId: _chatId,
  children,
}: {
  active: Tab;
  chatId?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <Sidebar />
      <div className="lg:pl-[248px]">
        <TopBar />
        <main className="overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
