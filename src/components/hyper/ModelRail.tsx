import { useRef } from "react";
import { Check, Loader2, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type VirtualModel = {
  id: string;
  name: string;
  meta: string;
  headshotUrl?: string | null;
  status?: string;
};

const LONG_PRESS_MS = 550;

export function ModelRail({
  models,
  selectedId,
  onSelect,
  onCreate,
  onLongPress,
}: {
  models: VirtualModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onLongPress?: (model: VirtualModel) => void;
}) {
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const cancel = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
      {models.map((m) => {
        const on = m.id === selectedId;
        const busy = !!m.status && m.status !== "ready";
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            aria-busy={busy}
            onClick={() => {
              if (longPressed.current) {
                longPressed.current = false;
                return;
              }
              if (busy) return;
              onSelect(m.id);
            }}
            onPointerDown={() => {
              cancel();
              longPressed.current = false;
              if (!onLongPress) return;
              timer.current = window.setTimeout(() => {
                longPressed.current = true;
                onLongPress(m);
              }, LONG_PRESS_MS);
            }}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onContextMenu={(e) => {
              if (!onLongPress) return;
              e.preventDefault();
              onLongPress(m);
            }}
            className={cn(
              "relative aspect-square w-[92px] shrink-0 overflow-hidden rounded-xl border bg-surface text-left transition-colors select-none",
              on ? "border-primary" : "border-border hover:border-border-strong",
              busy && "cursor-default",
            )}
          >
            {busy ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/40 px-2 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" strokeWidth={1.6} />
                <span className="text-[10px] font-bold text-muted-foreground">Processing…</span>
                <span className="w-full truncate text-[10px] text-muted-foreground/80">{m.name}</span>
              </div>
            ) : m.headshotUrl ? (
              <img
                src={m.headshotUrl}
                alt={m.name}
                loading="lazy"
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-muted/40">
                <User className="h-7 w-7 text-muted-foreground" strokeWidth={1.4} />
              </div>
            )}
            {!busy && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5">
                <p className="truncate text-[11px] font-bold text-white">{m.name}</p>
              </div>
            )}
            {on && !busy && (
              <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" strokeWidth={2.6} />
              </span>
            )}
          </button>
        );
      })}


      <button
        type="button"
        onClick={onCreate}
        className="flex aspect-square w-[92px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong bg-surface/60 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        <span className="text-[10.5px] font-bold">New</span>
      </button>
    </div>
  );
}
