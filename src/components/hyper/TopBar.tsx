import { useState } from "react";
import { useAccount } from "@/hooks/useAccount";
import {
  Search,
  Zap,
  ArrowLeft,
  Menu,
  X,
  Home,
  Plus,
  History,
  MessageSquare,
  ChevronDown,
  ImageIcon,
  Video,
  AudioLines,
  UserSquare,
  LibraryBig,
  Clapperboard,
  Plug,
  Workflow,
} from "lucide-react";
import { useRouterState, useRouter, Link } from "@tanstack/react-router";
import { ProfileMenu } from "./ProfileMenu";
import { AppIcon } from "./AppIcon";
import { useCopilotStore } from "./useCopilotStore";
import { cn } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/image": "Image Studio",
  "/video": "Video Studio",
  "/video-agent": "Video Agent",
  "/audio": "Audio Studio",
  "/virtual-model": "Virtual Model",
  "/virtual-model/create-model": "Create Model",
  "/library": "Library",
  "/settings": "Settings",
  "/pricing": "Pricing",
  "/terms": "Terms of Service",
  "/privacy": "Privacy Policy",
  "/integrations": "Integrations",
  "/workflows": "Workflows",
  "/workflows/create": "Create Workflow",
};

const drawerGenerate: { label: string; icon: typeof Home; to?: string }[] = [
  { label: "Image", icon: ImageIcon, to: "/image" },
  { label: "Virtual Model", icon: UserSquare, to: "/virtual-model" },
  { label: "Video", icon: Video, to: "/video" },
  { label: "Video Agent", icon: Clapperboard, to: "/video-agent" },
  { label: "Audio", icon: AudioLines, to: "/audio" },
];

function DrawerLink({
  icon: Icon,
  label,
  to,
  onNavigate,
  disabled,
}: {
  icon: typeof Home;
  label: string;
  to?: string | undefined;
  onNavigate: () => void;
  disabled?: boolean | undefined;
}) {
  const cls = cn(
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
    disabled
      ? "cursor-default text-muted-foreground/60"
      : "text-muted-foreground hover:bg-surface hover:text-foreground",
  );
  if (!to || disabled) {
    return (
      <button type="button" className={cls}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
        {label}
      </button>
    );
  }
  return (
    <Link to={to} onClick={onNavigate} className={cls}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
      {label}
    </Link>
  );
}

function DrawerCopilot({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { chats } = useCopilotStore();
  const recent = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  const rowCls =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={rowCls}
      >
        <AppIcon className="h-[18px] w-[18px] rounded-[5px]" />
        Copilot
        <ChevronDown
          className={cn("ml-auto h-4 w-4 opacity-60 transition-transform", open && "rotate-180")}
          strokeWidth={2.2}
        />
      </button>
      {open ? (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border pl-2">
          <Link to="/copilot" onClick={onNavigate} className={rowCls}>
            <Plus className="h-[18px] w-[18px]" strokeWidth={1.7} />
            New
          </Link>
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            aria-expanded={historyOpen}
            className={rowCls}
          >
            <History className="h-[18px] w-[18px]" strokeWidth={1.7} />
            History
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 opacity-60 transition-transform",
                historyOpen && "rotate-180",
              )}
              strokeWidth={2.2}
            />
          </button>
          {historyOpen ? (
            <div className="ml-3 mt-0.5 max-h-[180px] space-y-0.5 overflow-y-auto border-l border-border pl-2">
              {recent.length === 0 ? (
                <p className="px-3 py-1.5 text-[12px] text-muted-foreground/70">No chats yet</p>
              ) : (
                recent.map((chat) => (
                  <Link
                    key={chat.id}
                    to="/copilot/$chatId"
                    params={{ chatId: chat.id }}
                    onClick={onNavigate}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{chat.title}</span>
                  </Link>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TopBar() {
  const { account } = useAccount();
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  const title = pageTitles[pathname.replace(/\/$/, "") || "/"];
  const [menuOpen, setMenuOpen] = useState(false);

  const drawer = menuOpen ? (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={() => setMenuOpen(false)}
      />
      <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-border bg-background px-3 py-4 shadow-2xl">
        <div className="flex items-center justify-between px-2 pb-3">
          <span className="text-[15px] font-extrabold tracking-[-0.02em]">Hyper Copilot</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto pt-2">
          <DrawerCopilot onNavigate={() => setMenuOpen(false)} />
          <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            Generate
          </p>
          {drawerGenerate.map((i) => (
            <DrawerLink
              key={i.label}
              icon={i.icon}
              label={i.label}
              to={i.to}
              onNavigate={() => setMenuOpen(false)}
              disabled={!i.to}
            />
          ))}
          <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            My Work
          </p>
          <DrawerLink
            icon={LibraryBig}
            label="Library"
            to="/library"
            onNavigate={() => setMenuOpen(false)}
          />
          <DrawerLink
            icon={Plug}
            label="Integrations"
            to="/integrations"
            onNavigate={() => setMenuOpen(false)}
          />
          <DrawerLink
            icon={Workflow}
            label="Workflows"
            to="/workflows"
            onNavigate={() => setMenuOpen(false)}
          />
        </nav>
      </div>
    </div>
  ) : null;

  if (title) {
    return (
      <>
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/70 px-4 py-3 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Back"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1)
                  router.history.back();
                else router.navigate({ to: "/copilot" });
              }}
              className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            </button>

            <h1 className="truncate text-[15px] font-bold tracking-[-0.02em]">{title}</h1>
          </div>

          <ProfileMenu />
        </header>
        {drawer}
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/70 px-4 py-3 backdrop-blur-xl lg:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-surface-2"
          >
            <Menu className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
          <span className="text-[15px] font-extrabold tracking-[-0.02em]">Hyper Copilot</span>
        </div>

        <div className="ml-auto hidden min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-muted-foreground lg:flex lg:max-w-md">
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          <input
            aria-label="Search prompts, models and assets"
            placeholder="Search prompts, models and assets"
            className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold sm:flex">
            <Zap className="h-3.5 w-3.5 text-spectral-1" strokeWidth={2.2} />
            {account ? account.credits.toLocaleString() : "—"}
            <span className="text-muted-foreground">credits</span>
          </span>
          <ProfileMenu />
        </div>
      </header>
      {drawer}
    </>
  );
}
