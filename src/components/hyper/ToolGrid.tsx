import { ArrowUpRight, Eraser, Expand, Film, Layers2, Mic, Type, Wand2 } from "lucide-react";

const tools = [
  {
    title: "Text to Image",
    desc: "Photoreal frames from a sentence",
    icon: Wand2,
    tag: "Hyper Image Flash",
  },
  { title: "Text to Video", desc: "5s cinematic clips, 1080p", icon: Film, tag: "Motion 2" },
  { title: "Generative Fill", desc: "Repaint or extend any region", icon: Eraser, tag: "Studio" },
  { title: "Upscale to 8K", desc: "Detail-preserving super-res", icon: Expand, tag: "Fast" },
  { title: "Text Effects", desc: "Typography made of matter", icon: Type, tag: "Playful" },
  { title: "Voice & Score", desc: "Narration and adaptive music", icon: Mic, tag: "Audio" },
  { title: "Style Kits", desc: "Lock a look across renders", icon: Layers2, tag: "Brand" },
];

export function ToolGrid() {
  return (
    <section aria-labelledby="tools-heading" className="mt-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="tools-heading" className="text-xl font-extrabold tracking-tight sm:text-2xl">
            Every model, one canvas
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Commercially safe generative tools, tuned for production work.
          </p>
        </div>
        <button
          type="button"
          className="hidden shrink-0 items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          View all
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.title}
              type="button"
              className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <div
                aria-hidden
                className="bg-aura pointer-events-none absolute -inset-x-8 -top-16 h-32 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
              <div className="relative flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2">
                  <Icon className="h-[18px] w-[18px] text-spectral-3" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold">{t.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
                    {t.desc}
                  </p>
                </div>
                <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t.tag}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
