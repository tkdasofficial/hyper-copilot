import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/oauth/google/return")({
  ssr: false,
  component: GoogleOAuthReturn,
});

type Phase = "working" | "done" | "error";

function GoogleOAuthReturn() {
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState("Linking your channel…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error_description") ?? params.get("error");
    const state = params.get("state");
    const payload = { type: "googleOAuth", code, state, error };

    try {
      window.localStorage.setItem(
        "googleOAuthResult",
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
      if (event.data?.type !== "googleOAuthAck") return;
      if (event.data.ok) {
        setPhase("done");
        setMessage("Channel linked");
        closeSoon(600);
      } else {
        setPhase("error");
        setMessage(String(event.data.message ?? "Linking failed"));
        closeSoon(1600);
      }
    };
    window.addEventListener("message", onAck);

    window.opener?.postMessage(payload, window.location.origin);
    if (!window.opener) closeSoon(600);
    else timers.push(window.setTimeout(() => closeSoon(0), 20000));

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
    </div>
  );
}
