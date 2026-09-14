import { Heart, Copy, Images } from "lucide-react";
import { galleryItems } from "@/lib/content";

export function Gallery() {
  return (
    <section aria-labelledby="gallery-heading" className="mt-16">
      <div className="flex items-center gap-3">
        <h2 id="gallery-heading" className="text-xl font-extrabold tracking-tight sm:text-2xl">
          Made with Hyper Copilot
        </h2>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          Community
        </span>
      </div>

      {galleryItems.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-3xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
          <Images className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-[14px] font-semibold">Nothing here yet</p>
          <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
            Community creations will appear here as soon as people start generating.
          </p>
        </div>
      ) : (
        <div className="mt-5 columns-1 gap-3 sm:columns-2 xl:columns-3 [&>*]:mb-3">
          {galleryItems.map((item) => (
            <figure
              key={item.id}
              className="group relative break-inside-avoid overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <img
                src={item.src}
                alt={item.alt}
                width={item.width}
                height={item.height}
                loading="lazy"
                className="w-full transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-background via-background/80 to-transparent p-3.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                <p className="line-clamp-2 text-[12.5px] leading-snug text-foreground">
                  {item.prompt}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {item.model}
                </p>
              </figcaption>
              <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-background/70 backdrop-blur"
                >
                  <Heart className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-background/70 backdrop-blur"
                >
                  <Copy className="h-4 w-4" strokeWidth={1.9} />
                </span>
              </div>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
