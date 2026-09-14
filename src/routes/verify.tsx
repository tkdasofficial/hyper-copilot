import { useEffect, useState } from "react";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MailCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/hyper/Logo";

export const Route = createFileRoute("/verify")({
  ssr: false,
  head: () =>
    pageHead({
      path: "/verify",
      title: "Confirm Your Email \u2014 Hyper Copilot",
      description:
        "Confirm your email address to activate your Hyper Copilot account and start generating.",
      noindex: true,
      keywords: [
        "Hyper Copilot email verification",
        "activate AI account",
      ],
    }),
  component: VerifyPage,
});

function VerifyPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmail(window.sessionStorage.getItem("hyper:pending-email"));
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.email_confirmed_at) {
        navigate({ to: "/getting-ready", replace: true });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.email_confirmed_at) {
        navigate({ to: "/getting-ready", replace: true });
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function resend() {
    if (!email) {
      toast.error("We don't know which address to resend to. Please sign up again.");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/verify` },
    });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success("Confirmation email sent again.");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>

      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-7 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border bg-surface-2">
          <MailCheck className="h-5 w-5 text-spectral-3" strokeWidth={1.9} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Confirm your email</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          We sent a confirmation link{email ? " to " : ""}
          {email ? <span className="font-semibold text-foreground">{email}</span> : ""}. Tap the
          link to verify — this page moves on automatically once you do.
        </p>

        <button
          type="button"
          onClick={resend}
          disabled={sending}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-[13px] font-bold transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <RefreshCw className={sending ? "h-4 w-4 animate-spin" : "h-4 w-4"} strokeWidth={2} />
          Resend confirmation email
        </button>

        <p className="mt-4 text-[12px] text-muted-foreground">
          Wrong address?{" "}
          <Link to="/auth" className="font-semibold text-foreground underline-offset-4 hover:underline">
            Use another email
          </Link>
        </p>
      </div>
    </div>
  );
}
