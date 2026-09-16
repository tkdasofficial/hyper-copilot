import type { LucideIcon } from "lucide-react";
import {
  Home,
  ImageIcon,
  Video,
  AudioLines,
  PenTool,
  Boxes,
  Sparkles,
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
import { VideoAgentIcon } from "./VideoAgentIcon";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  icon: LucideIcon | React.FC<{ className?: string }>;
  badge?: string;
  to?: string;
};

const primary: Item[] = [
  { label: "Home", icon: Home, to: "/dashboard" },
  { label: "Explore", icon: Compass },
];

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

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
      {children}
    </p>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-background/80 px-3 pb-4 pt-4 backdrop-blur-xl lg:flex">
      <div className="px-2 pb-3">
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto">
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

      <div className="ring-spectral mt-4 overflow-hidden rounded-2xl bg-surface p-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-spectral-2" strokeWidth={2} />
          <p className="text-[13px] font-bold">Hyper Pro</p>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Unlimited fast renders, 4K upscaling and private models.
        </p>
        <Link
          to="/pricing"
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Upgrade
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </Link>
      </div>
    </aside>
  );
}
