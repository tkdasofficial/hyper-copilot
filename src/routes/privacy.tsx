import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/hyper/Sidebar";
import { TopBar } from "@/components/hyper/TopBar";

export const Route = createFileRoute("/privacy")({
  head: () =>
    pageHead({
      path: "/privacy",
      title: "Privacy Policy \u2014 Hyper Copilot",
      description:
        "How Hyper Copilot collects, uses and protects your prompts, uploaded references and account data, plus the controls you have over them.",
      keywords: [
        "Hyper Copilot privacy policy",
        "AI data privacy",
        "AI prompt data retention",
        "GDPR AI platform",
        "AI model training opt out",
      ],
      breadcrumbs: [
        { name: "Privacy Policy", path: "/privacy" },
      ],
    }),
  component: PrivacyPage,
});

const sections = [
  {
    h: "Data we collect",
    p: "Account details, prompts you submit, references you upload, and basic usage metrics such as credits consumed and models used.",
  },
  {
    h: "How we use it",
    p: "To generate your output, keep your history and library available, prevent abuse, and improve reliability of the platform.",
  },
  {
    h: "Model training",
    p: "Your prompts and uploads are not used to train public models. Private model fine-tuning happens only on assets you explicitly select.",
  },
  {
    h: "Retention",
    p: "Generations stay in your workspace until you delete them. Deleted assets are purged from backups within 30 days.",
  },
  {
    h: "Your controls",
    p: "You can export or delete your workspace data at any time from Settings, or request removal by contacting support.",
  },
];

function PrivacyPage() {
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
