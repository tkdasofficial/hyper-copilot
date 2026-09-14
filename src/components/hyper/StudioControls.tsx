import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function Section({
  title,
  desc,
  children,
  id,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-h`}
      className="scroll-mt-24 rounded-3xl border border-border bg-surface/60 p-4 sm:p-5"
    >
      <h2 id={`${title.replace(/\s+/g, "-").toLowerCase()}-h`} className="text-[14.5px] font-bold">
        {title}
      </h2>
      {desc ? <p className="mt-1 text-[12px] text-muted-foreground">{desc}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Segment<T extends string>({
  label,
  options,
  value,
  onChange,
  disabledOptions,
}: {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabledOptions?: readonly T[];
}) {
  return (
    <div>
      {label ? <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{label}</p> : null}
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max snap-x snap-mandatory gap-1.5 rounded-2xl border border-border bg-background p-1">
          {options.map((o) => {
            const locked = disabledOptions?.includes(o) ?? false;
            return (
              <button
                key={o}
                type="button"
                disabled={locked}
                aria-disabled={locked}
                aria-pressed={value === o}
                onClick={() => !locked && onChange(o)}
                className={cn(
                  "shrink-0 snap-start whitespace-nowrap rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  locked
                    ? "cursor-not-allowed text-muted-foreground opacity-40"
                    : value === o
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Fixed square tile with an inner box that expands to the ratio shape. */
export function RatioTile({
  ratio,
  active,
  size = 68,
  onClick,
}: {
  ratio: string;
  active: boolean;
  size?: number;
  onClick: () => void;
}) {
  const [w = 1, h = 1] = ratio.split(":").map(Number);
  const max = Math.max(w || 1, h || 1);
  const inner = size - 18;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 snap-start place-items-center rounded-2xl border transition-colors",
        active
          ? "border-foreground/30 bg-surface-2 shadow-sm"
          : "border-border bg-background hover:border-border-strong hover:bg-surface-2/60",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-[6px] border transition-colors",
          active ? "border-foreground bg-foreground/10" : "border-muted-foreground/50",
        )}
        style={{
          width: `${Math.max(24, ((w || 1) / max) * inner)}px`,
          height: `${Math.max(18, ((h || 1) / max) * inner)}px`,
        }}
      >
        <span
          className={cn(
            "text-[10.5px] font-bold leading-none tabular-nums",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {ratio}
        </span>
      </span>
    </button>
  );
}

export function RatioBlocks<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      {label ? <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{label}</p> : null}
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max snap-x snap-mandatory gap-2">
          {options.map((o) => (
            <RatioTile key={o} ratio={o} active={value === o} onClick={() => onChange(o)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Chips({
  label,
  options,
  values,
  onToggle,
}: {
  label?: string;
  options: readonly string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      {label ? <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{label}</p> : null}
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max snap-x snap-mandatory gap-2">
          {options.map((o) => {
            const on = values.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(o)}
                className={cn(
                  "shrink-0 snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  on
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-muted-foreground">{label}</p>
        <span className="text-[12px] font-bold tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
    </div>
  );
}

export function SwitchRow({
  label,
  desc,
  checked,
  onCheckedChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{label}</p>
        {desc ? <p className="mt-0.5 text-[11.5px] text-muted-foreground">{desc}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

export function TextRow({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{label}</p>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-3 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-border-strong"
      />
    </div>
  );
}

export function Panel({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface/50 transition-colors",
        open ? "border-border-strong" : "border-border",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={summary ? `${title} — ${summary}` : title}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
            open
              ? "border-foreground/25 bg-foreground/10"
              : "border-border bg-background group-hover:border-border-strong",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              open ? "bg-foreground" : "bg-muted-foreground",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight">{title}</span>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all",
            open
              ? "border-foreground/25 bg-foreground text-background"
              : "border-border bg-background text-muted-foreground group-hover:border-border-strong group-hover:text-foreground",
          )}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
            strokeWidth={2.25}
          />
        </span>
      </button>
      {open ? <div className="space-y-3.5 border-t border-border px-3.5 py-3.5">{children}</div> : null}
    </div>
  );
}
