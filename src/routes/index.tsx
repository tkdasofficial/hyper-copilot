import { useEffect } from "react";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bot,
  CalendarClock,
  Check,
  Film,
  ImageIcon,
  Layers2,
  Library,
  PlugZap,
  UserSquare,
  Workflow,
} from "lucide-react";
import { siYoutube, siInstagram, siFacebook, siThreads } from "simple-icons";
import { Logo } from "@/components/hyper/Logo";
import { useSession } from "@/hooks/useSession";
import studioPhoto from "@/assets/studio-monochrome.jpg";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      path: "/",
      title: "Hyper Copilot — Multi-Modal AI Generator",
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
          name: "Hyper Copilot",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "All",
          url: "https://hypercopilot.vercel.app/",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          creator: {
            "@type": "Person",
            name: "Tushar Kanti Das",
          },
        },
      ],
    }),

  component: Landing,
});

function BrandIcon({ path, title }: { path: string; title: string }) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 fill-current"
    >
      <path d={path} />
    </svg>
  );
}

const marquee = [
  "Text to Image",
  "Text to Video",
  "Virtual Models",
  "Voice & Speech",
  "Autonomous Video Agent",
  "Auto-Publishing",
  "Style Kits",
  "8K Upscale",
];

const powers = [
  {
    index: "01",
    title: "Virtual Model Studio",
    desc: "Create persistent AI influencers with reproducible seeds and locked attributes. The same face, the same identity — across every portrait, campaign and shoot.",
    icon: UserSquare,
  },
  {
    index: "02",
    title: "Autonomous Video Agent",
    desc: "Hand it a concept or a script. The agent plans, generates, scores and assembles a polished video end-to-end — no timeline editing required.",
    icon: Bot,
  },
  {
    index: "03",
    title: "Workflows & Scheduling",
    desc: "Recurring triggers, time slots and queue management. Set a content pipeline once and let the cron runner publish on schedule, forever.",
    icon: Workflow,
  },
  {
    index: "04",
    title: "One-Click Integrations",
    desc: "Secure OAuth for YouTube, Instagram, Facebook and Threads. Connect once — Hyper writes platform-perfect titles, hooks and hashtags for each.",
    icon: PlugZap,
  },
];

const studio = [
  { title: "Text to Image", desc: "Photoreal frames from a single sentence.", icon: ImageIcon },
  { title: "Text to Video", desc: "Cinematic 1080p clips with camera control.", icon: Film },
  { title: "Voice & Speech", desc: "Multi-speaker narration with custom personas.", icon: AudioLines },
  { title: "Style Kits", desc: "Lock a brand look across every render.", icon: Layers2 },
];

const pipeline = [
  { step: "Create", desc: "Prompt image, video, voice or your virtual model in one studio." },
  { step: "Refine", desc: "Iterate with references, style kits and one-click re-runs." },
  { step: "Schedule", desc: "Queue assets into automated workflows with time slots." },
  { step: "Publish", desc: "Auto-post to YouTube, Reels and Threads with optimized copy." },
];

const platforms = [
  { name: "YouTube & Shorts", path: siYoutube.path },
  { name: "Instagram Reels", path: siInstagram.path },
  { name: "Facebook Reels", path: siFacebook.path },
  { name: "Threads", path: siThreads.path },
];

const included = [
  "Unlimited projects and prompt history",
  "Private virtual model training",
  "Autonomous video agent runs",
  "Automated publishing workflows",
  "Team library with shared assets",
  "4K/8K upscaling pipeline",
];

function Landing() {
  const navigate = useNavigate();
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/copilot", replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
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
              className="rounded-full bg-foreground px-3.5 py-2 text-[13px] font-bold text-background transition-opacity hover:opacity-85"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 lg:px-8">
        {/* Hero */}
        <section className="relative border-x border-b border-border px-4 pb-16 pt-16 text-center sm:px-8 sm:pb-24 sm:pt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_5%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_5%,transparent)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]"
          />
          <h1 className="relative mx-auto max-w-5xl text-[52px] font-extrabold leading-[0.92] tracking-[-0.045em] sm:text-7xl lg:text-[104px]">
            Create. Schedule.
            <br />
            <span className="text-outline">Publish.</span> Repeat.
          </h1>
          <p className="relative mx-auto mt-5 max-w-xl text-[14px] leading-relaxed text-muted-foreground sm:text-base">
            Hyper Copilot unifies image, video, voice and virtual AI models — then ships the
            finished content to YouTube, Instagram, Facebook and Threads on autopilot.
          </p>
          <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-6 py-3 text-[13.5px] font-bold text-background transition-opacity hover:opacity-85"
            >
              Start creating free
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-6 py-3 text-[13.5px] font-bold transition-colors hover:bg-surface-2"
            >
              See pricing
            </Link>
          </div>
          <dl className="relative mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-y-8 border-t border-border pt-8 sm:grid-cols-4">
            {[
              ["8+", "Creative engines"],
              ["4", "Social platforms"],
              ["1", "Prompt box"],
              ["24/7", "Auto-publishing"],
            ].map(([value, label]) => (
              <div key={label} className="text-center">
                <dt className="order-2 mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Marquee */}
        <section aria-hidden className="overflow-hidden border-x border-b border-border py-4">
          <div className="animate-marquee flex w-max items-center gap-8 whitespace-nowrap">
            {[...marquee, ...marquee].map((m, i) => (
              <span
                key={i}
                className="flex items-center gap-8 text-[12px] font-bold uppercase tracking-[0.22em] text-muted-foreground"
              >
                {m}
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              </span>
            ))}
          </div>
        </section>

        {/* Powers */}
        <section aria-labelledby="powers" className="border-x border-border">
          <div className="border-b border-border px-4 py-10 sm:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
              The heavy hitters
            </p>
            <h2
              id="powers"
              className="mt-2 max-w-2xl text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl"
            >
              Four engines no other studio puts in one place
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {powers.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className={`group relative border-border p-6 transition-colors hover:bg-surface sm:p-8 ${
                    i % 2 === 0 ? "sm:border-r" : ""
                  } ${i < 2 ? "border-b sm:border-b" : "border-b sm:border-b-0"}`}
                >
                  <div className="flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-border bg-surface-2 transition-colors group-hover:bg-foreground group-hover:text-background">
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <span className="text-[13px] font-extrabold tabular-nums text-muted-foreground/40">
                      {p.index}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold tracking-[-0.015em]">{p.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                    {p.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pipeline */}
        <section aria-labelledby="pipeline" className="border-x border-b border-border">
          <div className="border-b border-border px-4 py-10 sm:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
              The workflow
            </p>
            <h2
              id="pipeline"
              className="mt-2 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl"
            >
              From prompt to published, hands-free
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map((s, i) => (
              <div
                key={s.step}
                className={`border-border p-6 sm:p-7 ${i < pipeline.length - 1 ? "border-b sm:border-b lg:border-b-0 lg:border-r" : ""} ${i === 1 ? "sm:border-r lg:border-r" : ""} ${i === 0 ? "sm:border-r" : ""} ${i === 2 ? "sm:border-b-0" : ""}`}
              >
                <p className="text-[32px] font-extrabold leading-none tracking-[-0.03em] text-muted-foreground/30">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-4 flex items-center gap-1.5 text-[15px] font-extrabold">
                  {s.step}
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.4} />
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Integrations */}
        <section
          aria-labelledby="integrations"
          className="border-x border-b border-border bg-foreground text-background"
        >
          <div className="px-4 py-14 sm:px-8 sm:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-60">
              Integrations
            </p>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <h2
                id="integrations"
                className="max-w-xl text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl"
              >
                Connect once. Publish everywhere.
              </h2>
              <p className="max-w-sm text-[13.5px] leading-relaxed opacity-70">
                Secure OAuth hub with token lifecycle tracking. Hyper writes platform-optimized
                titles, hooks and hashtags for every channel — automatically.
              </p>
            </div>
            <div className="mt-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {platforms.map((pl) => (
                <div
                  key={pl.name}
                  className="flex items-center gap-3 rounded-2xl border border-background/20 px-4 py-4 transition-colors hover:bg-background/10"
                >
                  <BrandIcon path={pl.path} title={pl.name} />
                  <span className="text-[13px] font-bold">{pl.name}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2.5 text-[12.5px] opacity-70">
              <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={1.9} />
              Recurring schedules, queue management and automated cron execution included.
            </div>
          </div>
        </section>

        {/* Studio grid */}
        <section aria-labelledby="studio" className="border-x border-b border-border">
          <div className="border-b border-border px-4 py-10 sm:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
              The studio
            </p>
            <h2
              id="studio"
              className="mt-2 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl"
            >
              Every medium, one prompt box
            </h2>
          </div>
          <div className="border-b border-border">
            <img
              src={studioPhoto}
              alt="Hyper Copilot studio: AI video generation on a laptop beside printed virtual model portraits, a storyboard, and a phone showing the published post"
              loading="lazy"
              width={1600}
              height={912}
              className="h-auto w-full object-cover grayscale"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {studio.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={`group border-border p-6 transition-colors hover:bg-surface ${i < studio.length - 1 ? "border-b lg:border-b-0 lg:border-r" : ""} ${i % 2 === 0 ? "sm:border-r" : ""} ${i < 2 ? "sm:border-b lg:border-b-0" : ""}`}
                >
                  <Icon
                    className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground"
                    strokeWidth={1.8}
                  />
                  <p className="mt-4 text-[14px] font-bold">{f.title}</p>
                  <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{f.desc}</p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-border px-4 py-5 sm:px-8">
            <Library className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.9} />
            <p className="text-[12.5px] text-muted-foreground">
              Everything lands in one unified library — filter, download, re-prompt or publish any
              asset.
            </p>
          </div>
        </section>

        {/* Included */}
        <section
          aria-labelledby="included"
          className="border-x border-b border-border px-4 py-14 sm:px-8 sm:py-20"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
            Included in every plan
          </p>
          <h2
            id="included"
            className="mt-2 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl"
          >
            Everything you need to go live
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[14px] leading-snug">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-foreground text-background">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="border-x border-b border-border px-4 py-20 text-center sm:px-8 sm:py-28">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-5xl">
            Your content engine starts in under a minute
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            Create your account with email or Google — no credit card needed.
          </p>
          <Link
            to="/auth"
            className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-foreground px-7 py-3.5 text-[14px] font-bold text-background transition-opacity hover:opacity-85"
          >
            Get started free
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
