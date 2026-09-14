import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/hyper/Sidebar";
import { TopBar } from "@/components/hyper/TopBar";

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      path: "/terms",
      title: "Terms of Service \u2014 Hyper Copilot",
      description:
        "The terms that govern your use of Hyper Copilot, including acceptable use, output ownership, credits and account termination.",
      keywords: [
        "Hyper Copilot terms of service",
        "AI output ownership",
        "AI commercial use license",
        "AI acceptable use policy",
      ],
      breadcrumbs: [
        { name: "Terms of Service", path: "/terms" },
      ],
    }),
  component: TermsPage,
});

const sections = [
  {
    h: "1. Using Hyper Copilot",
    p: "You may use Hyper Copilot to generate images, video, vectors and audio for personal and commercial projects, provided your prompts and references do not infringe the rights of others.",
  },
  {
    h: "2. Your content and output",
    p: "You keep the rights to the prompts and references you upload. Subject to your plan, you also own the output you generate and may use it commercially.",
  },
  {
    h: "3. Acceptable use",
    p: "Do not generate content that is unlawful, hateful, sexually explicit involving minors, or intended to deceive people about real events or identities.",
  },
  {
    h: "4. Credits and billing",
    p: "Credits are consumed per generation and reset at the start of each billing period. Paid plans renew automatically until cancelled.",
  },
  {
    h: "5. Changes",
    p: "We may update these terms as the product evolves. Continued use after an update means you accept the revised terms.",
  },
];

function TermsPage() {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <Sidebar />
      <div className="lg:pl-[248px]">
        <TopBar />
        <main className="mx-auto max-w-2xl px-4 pb-28 pt-6 lg:px-8 lg:pb-20">
          <div className="space-y-6">
            {sections.map((s) => (
              <section key={s.h}>
                <h2 className="text-[15px] font-bold">{s.h}</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{s.p}</p>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
