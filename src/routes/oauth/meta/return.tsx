import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/oauth/meta/return")({
  ssr: false,
  component: MetaOAuthReturn,
});

type Phase = "working" | "done" | "error";

function MetaOAuthReturn() {
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState("Linking your account…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error_description") ?? params.get("error");
    const state = params.get("state");
    const payload = { type: "metaOAuth", code, state, error };

    try {
      window.localStorage.setItem(
        "metaOAuthResult",
        JSON.stringify({ ...payload, at: Date.now() }),
      );
    } catch {
      /* storage unavailable */
    }

    const timers: number[] = [];
    const closeSoon = (delay: number) => {
      timers.push(
        window.setTimeout(() => {
          window.close();
          timers.push(
            window.setTimeout(() => {
              if (!window.closed) window.location.replace("/integrations");
            }, 400),
          );
        }, delay),
      );
    };

    if (error) {
      setPhase("error");
      setMessage(String(error));
      closeSoon(1600);
      return () => timers.forEach((t) => window.clearTimeout(t));
    }

    const onAck = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "metaOAuthAck") return;
      if (event.data.ok) {
        setPhase("done");
        setMessage("Account linked");
        closeSoon(600);
      } else {
        setPhase("error");
        setMessage(String(event.data.message ?? "Linking failed"));
        closeSoon(1600);
      }
    };
    window.addEventListener("message", onAck);

    window.opener?.postMessage(payload, window.location.origin);
    if (!window.opener) {
      // Opened as a tab: hand the result back to Integrations to finish there.
      closeSoon(600);
    } else {
      // Safety net if the app never acknowledges.
      timers.push(window.setTimeout(() => closeSoon(0), 20000));
    }

    return () => {
      window.removeEventListener("message", onAck);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const Icon = phase === "done" ? CheckCircle2 : phase === "error" ? AlertCircle : Loader2;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6">
      <Icon
        className={`size-6 ${phase === "working" ? "animate-spin text-muted-foreground" : phase === "done" ? "text-foreground" : "text-destructive"}`}
      />
      <p className="text-center text-[13.5px] text-muted-foreground">{message}</p>
      {phase === "working" ? (
        <p className="text-center text-[12px] text-muted-foreground/70">
          Keep this window open for a moment.
        </p>
      ) : null}
    </div>
  );
}
