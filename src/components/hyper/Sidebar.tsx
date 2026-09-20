import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  Plus,
  History,
  ChevronDown,
  MessageSquare,
  ImageIcon,
  Video,
  AudioLines,
  PenTool,
  Boxes,
  Compass,
  ChevronRight,
  UserSquare,
  LibraryBig,
  Plug,
  Workflow,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Logo } from "./Logo";
import { AppIcon } from "./AppIcon";
import { useCopilotStore } from "./useCopilotStore";
import { VideoAgentIcon } from "./VideoAgentIcon";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  icon: LucideIcon | React.FC<{ className?: string }>;
  badge?: string;
  to?: string;
};

const primary: Item[] = [{ label: "Explore", icon: Compass }];

const newChatItem: Item = { label: "New", icon: Plus, to: "/copilot" };

const generate: Item[] = [
  { label: "Image", icon: ImageIcon, to: "/image" },
  { label: "Virtual Model", icon: UserSquare, to: "/virtual-model", badge: "New" },
  { label: "Video", icon: Video, to: "/video", badge: "New" },
  { label: "Video Agent", icon: VideoAgentIcon, to: "/video-agent", badge: "New" },
  { label: "Audio", icon: AudioLines, to: "/audio" },
  { label: "Vector", icon: PenTool },
  { label: "3D Scene", icon: Boxes, badge: "Beta" },
];

const myWork: Item[] = [
  { label: "Library", icon: LibraryBig, to: "/library" },
  { label: "Integrations", icon: Plug, to: "/integrations" },
  { label: "Workflows", icon: Workflow, to: "/workflows" },
];

function NavItem({ item }: { item: Item }) {
  const Icon = item.icon;
  const cls = cn(
    "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
    "text-muted-foreground hover:bg-surface hover:text-foreground",
  );
  const inner = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.badge ? (
        <span className="ml-auto rounded-full border border-border-strong px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          {item.badge}
        </span>
      ) : null}
    </>
  );
  if (item.to) {
    return (
      <Link
        to={item.to}
        className={cls}
        activeProps={{ className: "bg-surface-2 text-foreground" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={() =>
        toast(`${item.label} is coming soon`, { description: "This studio is still in the works." })
      }
    >
      {inner}
    </button>
  );
}

function CopilotHistory() {
  const [open, setOpen] = useState(false);
  const { chats } = useCopilotStore();
  const recent = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      >
        <History className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">History</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 opacity-60 transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={2.2}
        />
      </button>
      {open ? (
        <div className="ml-3 mt-0.5 max-h-[150px] space-y-0.5 overflow-y-auto border-l border-border pl-2">
          {recent.length === 0 ? (
            <p className="px-3 py-1.5 text-[12px] text-muted-foreground/70">No chats yet</p>
          ) : (
            recent.map((chat) => (
              <Link
                key={chat.id}
                to="/copilot/$chatId"
                params={{ chatId: chat.id }}
                className="group flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                activeProps={{ className: "bg-surface-2 text-foreground" }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{chat.title}</span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
      {children}
    </p>
  );
}

export function Sidebar() {
  const [copilotOpen, setCopilotOpen] = useState(false);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-background/80 px-3 pb-4 pt-4 backdrop-blur-xl lg:flex">
      <div className="px-2 pb-3">
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => setCopilotOpen((open) => !open)}
          aria-expanded={copilotOpen}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <AppIcon className="h-[18px] w-[18px] rounded-[5px]" />
          <span className="truncate">Copilot</span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 opacity-60 transition-transform",
              copilotOpen && "rotate-180",
            )}
            strokeWidth={2.2}
          />
        </button>
        {copilotOpen ? (
          <div className="ml-5 space-y-0.5 border-l border-border pl-2">
            <NavItem item={newChatItem} />
            <CopilotHistory />
          </div>
        ) : null}
        <div className="space-y-0.5">
          {primary.map((i) => (
            <NavItem key={i.label} item={i} />
          ))}
        </div>
        <SectionLabel>Generate</SectionLabel>
        <div className="space-y-0.5">
          {generate.map((i) => (
            <NavItem key={i.label} item={i} />
          ))}
        </div>
        <div className="mt-6 border-t border-border pt-1">
          <SectionLabel>My Work</SectionLabel>
          <div className="space-y-0.5">
            {myWork.map((i) => (
              <NavItem key={i.label} item={i} />
            ))}
          </div>
        </div>
      </nav>
    </aside>
  );
}
