import { useEffect } from "react";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  AudioLines,
  Boxes,
  Check,
  Eraser,
  Expand,
  Film,
  ImageIcon,
  Layers2,
  PenTool,
  ShieldCheck,
  Sparkles,
  UserSquare,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/hyper/Logo";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      path: "/",
      title: "Hyper Copilot \u2014 Multi-Modal AI Generator",
      description:
        "Built by Tushar Kanti Das, Hyper Copilot is an all-in-one multi-modal AI platform for image, video, audio, and AI influencer creation.",
      keywords: [
        "AI image generator",
        "AI video generator",
        "AI music generator",
        "AI influencer creator",
        "photoreal image AI",
        "text to speech AI",
        "AI art generator online",
        "all in one AI studio",
        "generative AI for teams",
        "AI vector generator",
        "8K AI upscaler",
        "commercially safe AI images",
      ],
      jsonLd: [
        {
          "@type": "SoftwareApplication",
          "name": "Hyper Copilot",
          "applicationCategory": "MultimediaApplication",
          "operatingSystem": "All",
          "url": "https://hypercopilot.vercel.app/",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
          },
          "creator": {
            "@type": "Person",
            "name": "Tushar Kanti Das"
          }
        }
      ],
    }),

  component: Landing,
});

const features = [
  { title: "Text to Image", desc: "Photoreal frames from a single sentence.", icon: ImageIcon },
  { title: "Text to Video", desc: "Cinematic 1080p clips with motion control.", icon: Film },
  { title: "Virtual Models", desc: "Consistent AI talent across every shoot.", icon: UserSquare },
  { title: "Generative Fill", desc: "Repaint, extend or clean any region.", icon: Eraser },
  { title: "Upscale to 8K", desc: "Detail-preserving super resolution.", icon: Expand },
  { title: "Voice & Score", desc: "Narration and adaptive music in seconds.", icon: AudioLines },
  { title: "Vector & 3D", desc: "Editable vectors and 3D scene drafts.", icon: PenTool },
  { title: "Style Kits", desc: "Lock a brand look across every render.", icon: Layers2 },
];

const details = [
  {
    title: "One canvas, every model",
    desc: "Switch between image, video, vector and audio engines without leaving the prompt box. References, aspect ratios and style controls stay in place.",
    icon: Boxes,
  },
  {
    title: "Production speed",
    desc: "Hyper Image Flash renders in seconds, with batch generation, history and one-click re-runs so you can iterate at the pace of a review meeting.",
    icon: Zap,
  },
  {
    title: "Commercially safe",
    desc: "Licensed training data, private workspaces and no training on your prompts or uploads. Your library stays yours.",
    icon: ShieldCheck,
  },
];

const included = [
  "Unlimited projects and prompt history",
  "Reference images and style locking",
  "Team library with shared assets",
  "4K/8K upscaling pipeline",
  "Private virtual model training",
  "Export to PNG, MP4, SVG and WAV",
];

function Landing() {
  const navigate = useNavigate();
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 lg:px-8">
          <Logo />
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/pricing"
              className="hidden rounded-full px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Pricing
            </Link>
            <Link
              to="/auth"
              className="rounded-full px-3 py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              to="/auth"
              className="rounded-full bg-foreground px-3.5 py-2 text-[13px] font-bold text-background transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>


      <main className="mx-auto max-w-6xl px-4 pb-24 lg:px-8">
        <section className="relative pt-16 text-center sm:pt-24">
          <div
            aria-hidden
            className="bg-aura animate-drift pointer-events-none absolute -top-20 left-1/2 h-[420px] w-full max-w-[1100px] -translate-x-1/2 blur-[2px]"
          />
          <span className="relative inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-spectral-2" strokeWidth={2} />
            Hyper Image Flash is live
          </span>
          <h1 className="relative mt-5 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            Imagine anything.
            <br />
            <span className="text-spectral">Then make it real.</span>
          </h1>
          <p className="relative mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-muted-foreground sm:text-base">
            Hyper Copilot is one generative studio for image, video, vector and audio — with
            references, style kits and commercially safe output.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-3 text-[13.5px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started free
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-3 text-[13.5px] font-bold transition-colors hover:border-border-strong"
            >
              Log in
            </Link>
          </div>
        </section>

        <section aria-labelledby="features" className="mt-24 sm:mt-32">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            Features
          </p>
          <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="features" className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
              Everything in one studio
            </h2>
            <p className="max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
              Eight production-grade engines behind a single prompt box.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <div
                    aria-hidden
                    className="bg-aura pointer-events-none absolute -inset-x-8 -top-16 h-32 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />
                  <span className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-2">
                    <Icon className="h-[18px] w-[18px] text-spectral-3" strokeWidth={1.9} />
                  </span>
                  <p className="relative mt-3.5 text-[14px] font-bold">{f.title}</p>
                  <p className="relative mt-1 text-[12.5px] leading-snug text-muted-foreground">
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="details" className="mt-24 sm:mt-32">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            Why Hyper
          </p>
          <h2
            id="details"
            className="mt-2 text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl"
          >
            Built for teams that ship
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {details.map((d) => {
              const Icon = d.icon;
              return (
                <div
                  key={d.title}
                  className="rounded-3xl border border-border bg-surface p-6 transition-colors hover:border-border-strong"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-2">
                    <Icon className="h-[18px] w-[18px] text-spectral-2" strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-3.5 text-[15px] font-extrabold tracking-[-0.01em]">
                    {d.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{d.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="included"
          className="relative mt-24 overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:mt-32 sm:p-9"
        >
          <div
            aria-hidden
            className="bg-aura pointer-events-none absolute -inset-x-10 -top-24 h-48 opacity-60"
          />
          <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            Included in every plan
          </p>
          <h2
            id="included"
            className="relative mt-2 text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl"
          >
            Everything you need to go live
          </h2>
          <ul className="relative mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {included.map((i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-surface-2">
                  <Check className="h-3 w-3 text-spectral-3" strokeWidth={3} />
                </span>
                {i}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-24 text-center sm:mt-32">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
            Start creating in under a minute
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            Create your account with email or Google — no credit card needed.
          </p>
          <Link
            to="/auth"
            className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-3 text-[13.5px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        </section>

      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center lg:px-8">
          <p className="text-[12px] text-muted-foreground">
            Hyper Copilot · Generative AI for teams that ship
          </p>
          <div className="flex gap-4 text-[12px] text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
