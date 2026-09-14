import { useState } from "react";
import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { completeOnboarding } from "@/lib/profile.functions";
import { Logo } from "@/components/hyper/Logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/getting-ready")({
  head: () =>
    pageHead({
      path: "/getting-ready",
      title: "Getting Ready \u2014 Hyper Copilot",
      description:
        "Tell us your name, role and what you plan to create so we can tailor your studio.",
      noindex: true,
      keywords: [
        "Hyper Copilot onboarding",
      ],
    }),
  component: GettingReady,
});

const roles = ["Designer", "Marketer", "Founder", "Developer", "Creator", "Other"];
const purposes = [
  "Product imagery",
  "Social content",
  "Ads & campaigns",
  "Concept art",
  "Video & motion",
  "Just exploring",
];

function Chips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
            value === o
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-surface-2 text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function GettingReady() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role || !purpose) {
      toast.error("Pick your role and what you'll create.");
      return;
    }
    setBusy(true);
    try {
      await completeOnboarding({ data: { full_name: fullName.trim(), role, purpose } });
      navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("We couldn't save your details. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>

      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg space-y-6 rounded-3xl border border-border bg-surface p-7"
      >
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-spectral-2" strokeWidth={2} />
            Getting ready
          </span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Let's set up your studio</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            A few details so your workspace and models feel right from the first prompt.
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Full name</span>
          <input
            required
            minLength={2}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Alex Morgan"
            className="w-full rounded-2xl border border-border bg-surface-2 px-3.5 py-3 text-[14px] outline-none placeholder:text-muted-foreground focus:border-border-strong"
          />
        </label>

        <div>
          <span className="mb-2 block text-[12.5px] font-bold">What's your role?</span>
          <Chips options={roles} value={role} onChange={setRole} />
        </div>

        <div>
          <span className="mb-2 block text-[12.5px] font-bold">What will you create?</span>
          <Chips options={purposes} value={purpose} onChange={setPurpose} />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-3 text-[13.5px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enter the studio
        </button>
      </form>
    </div>
  );
}
