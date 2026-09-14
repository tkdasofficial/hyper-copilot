import { Check, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type GenResult = {
  id: string;
  prompt: string;
  dataUrl: string;
  isFinal: boolean;
  kind?: "image" | "video" | "audio";
  model: string;
  ratioLabel: string;
  styleName: string;
};

function extFor(kind: GenResult["kind"]) {
  if (kind === "video") return "mp4";
  if (kind === "audio") return "wav";
  return "png";
}

function ResultCard({ result }: { result: GenResult }) {
  const kind = result.kind ?? "image";
  const hasMedia = result.dataUrl.length > 0;
  return (
    <figure className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-surface">
      {hasMedia ? (
        kind === "video" ? (
          <video
            src={result.dataUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        ) : kind === "audio" ? (
          <div className="flex h-full w-full flex-col justify-center gap-3 p-4">
            <p className="line-clamp-4 text-[12.5px] leading-snug text-muted-foreground">
              {result.prompt}
            </p>
            <audio src={result.dataUrl} controls className="w-full" />
          </div>
        ) : (
          <img
            src={result.dataUrl}
            alt={result.prompt}
            className={cn(
              "h-full w-full object-cover transition-[filter] duration-500",
              result.isFinal ? "blur-0" : "blur-2xl",
            )}
          />
        )
      ) : (
        <div className="grid h-full w-full place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-foreground/70" strokeWidth={2} />
        </div>
      )}
      {result.isFinal && (
        <>
          {kind !== "audio" && (
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-background via-background/80 to-transparent p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
              <p className="line-clamp-2 text-[12.5px] leading-snug text-foreground">
                {result.prompt}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {result.model} · {result.ratioLabel}
              </p>
            </figcaption>
          )}
          <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-background/70 backdrop-blur">
              <Check className="h-4 w-4" strokeWidth={2} />
            </span>
            <a
              href={result.dataUrl}
              download={`hyper-${result.id}.${extFor(kind)}`}
              aria-label="Download result"
              className="grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-background/70 backdrop-blur transition-colors hover:bg-background"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
            </a>
          </div>
        </>
      )}
    </figure>
  );
}


export function ResultsGrid({
  results,
  generating,
}: {
  results: GenResult[];
  generating: boolean;
}) {
  if (results.length === 0 && !generating) return null;

  return (
    <section aria-label="Generated results" className="mx-auto mt-10 max-w-6xl">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Your creations</h2>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {generating ? "Generating…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {results.map((r) => (
          <ResultCard key={r.id} result={r} />
        ))}
      </div>
    </section>
  );
}