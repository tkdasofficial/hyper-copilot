import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/hyper/Sidebar";
import { TopBar } from "@/components/hyper/TopBar";
import { PromptComposer } from "@/components/hyper/PromptComposer";
import { ToolGrid } from "@/components/hyper/ToolGrid";
import { Gallery } from "@/components/hyper/Gallery";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () =>
    pageHead({
      path: "/dashboard",
      title: "Dashboard \u2014 Hyper Copilot Generative AI Studio",
      description:
        "Your Hyper Copilot studio: one prompt box for photoreal images, cinematic video, vectors and audio.",
      noindex: true,
      keywords: [
        "Hyper Copilot dashboard",
        "AI studio workspace",
      ],
    }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <Sidebar />
      <div className="lg:pl-[248px]">
        <TopBar />

        <main className="relative mx-auto max-w-6xl overflow-x-hidden px-4 pb-28 pt-10 sm:pt-14 lg:px-8 lg:pb-20">
          <div
            aria-hidden
            className="bg-aura animate-drift pointer-events-none absolute -top-24 left-1/2 h-[420px] w-full max-w-[1100px] -translate-x-1/2 blur-[2px]"
          />

          <section className="relative text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
              Hyper Image Flash is live
            </span>
            <h1 className="mt-5 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
              Imagine anything.
              <br />
              <span className="text-spectral">Then make it real.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-muted-foreground sm:text-base">
              One prompt box for image, video, vector and audio models — with references, style
              controls and commercially safe output.
            </p>
          </section>

          <div className="relative mx-auto mt-9 max-w-3xl">
            <PromptComposer />
          </div>

          <ToolGrid />
          <Gallery />

          <footer className="mt-20 flex flex-col items-center gap-2 border-t border-border pt-8 text-center">
            <p className="text-[12px] text-muted-foreground">
              Hyper Copilot · Generative AI for teams that ship
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
