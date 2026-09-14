import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useAccount } from "@/hooks/useAccount";
import { Sidebar } from "@/components/hyper/Sidebar";
import { TopBar } from "@/components/hyper/TopBar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () =>
    pageHead({
      path: "/pricing",
      title: "Pricing & Plans \u2014 Hyper Copilot AI Studio",
      description:
        "Compare Hyper Copilot plans: free starter credits, Pro unlimited fast renders with 4K upscaling, and Studio for teams shipping generative AI at scale.",
      keywords: [
        "AI generator pricing",
        "free AI image generator",
        "AI video generator price",
        "cheap AI art subscription",
        "AI studio plans",
        "unlimited AI image generation",
        "commercial license AI images",
        "AI credits pricing",
      ],
      breadcrumbs: [
        { name: "Pricing", path: "/pricing" },
      ],
      jsonLd: [
        {
          "@type": "Product",
          "name": "Hyper Copilot",
          "description": "Multi-modal AI generation platform",
          "brand": {
            "@type": "Brand",
            "name": "Hyper Copilot"
          },
          "offers": [
            {
              "@type": "Offer",
              "name": "Starter",
              "price": "0",
              "priceCurrency": "USD",
              "url": "https://hypercopilot.vercel.app/pricing"
            },
            {
              "@type": "Offer",
              "name": "Pro",
              "price": "29",
              "priceCurrency": "USD",
              "url": "https://hypercopilot.vercel.app/pricing"
            },
            {
              "@type": "Offer",
              "name": "Studio",
              "price": "89",
              "priceCurrency": "USD",
              "url": "https://hypercopilot.vercel.app/pricing"
            }
          ]
        }
      ],
    }),
  component: PricingPage,
});

const plans = [
  {
    tier: "free" as const,
    name: "Starter",
    price: "$0",
    note: "per month",
    features: ["150 credits monthly", "Standard queue", "Personal use license"],
  },
  {
    tier: "pro" as const,
    name: "Pro",
    price: "$29",
    note: "per month",
    highlight: true,
    features: ["Unlimited fast renders", "4K upscaling", "Private models", "Commercial license"],
  },
  {
    tier: "unlimited" as const,
    name: "Studio",
    price: "$89",
    note: "per seat / month",
    features: ["Shared workspaces", "Brand kits & HEAVEN presets", "Priority GPUs", "SSO & audit log"],
  },
];

function PricingPage() {
  const { account } = useAccount();
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <Sidebar />
      <div className="lg:pl-[248px]">
        <TopBar />
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 lg:px-8 lg:pb-20">
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => {
              const current = account?.tier === p.tier;
              return (
              <div
                key={p.name}
                className={cn(
                  "rounded-3xl border border-border bg-surface/60 p-5",
                  (p.highlight || current) && "ring-spectral bg-surface",
                )}
              >
                <p className="flex items-center justify-between text-[13px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {p.name}
                  {current ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] tracking-normal text-foreground">
                      Current plan
                    </span>
                  ) : null}
                </p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight">{p.price}</p>
                <p className="text-[12px] text-muted-foreground">{p.note}</p>
                <ul className="mt-4 space-y-2 text-[13px]">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-spectral-3" strokeWidth={2.2} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={current}
                  className="mt-5 w-full rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {current ? "Your plan" : `Choose ${p.name}`}
                </button>
              </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
