import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { completeYouTubeConnection, getYouTubeConfig } from "@/lib/youtube.functions";
import { providerInfo } from "@/lib/social.shared";

const RESULT_KEY = "googleOAuthResult";

type OAuthResult = { code?: string | null; state?: string | null; error?: string | null };

function readResult(): OAuthResult | null {
  try {
    const raw = window.localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as OAuthResult) : null;
  } catch {
    return null;
  }
}

function waitForCode(popup: Window, state: string) {
  return new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
    };
    const settle = (result: OAuthResult) => {
      cleanup();
      if (result.error) reject(new Error(String(result.error)));
      else if (result.code) resolve(String(result.code));
      else reject(new Error("Google did not return an authorization code."));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "googleOAuth" || event.data?.state !== state) return;
      settle(event.data as OAuthResult);
    };
    window.addEventListener("message", onMessage);
    const poll = window.setInterval(() => {
      const stored = readResult();
      if (stored && stored.state === state) {
        try {
          window.localStorage.removeItem(RESULT_KEY);
        } catch {
          /* ignore */
        }
        settle(stored);
        return;
      }
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before finishing."));
    }, 400);
  });
}

/** Runs the Google consent popup and stores the resulting YouTube channel. */
export function useYouTubeConnect() {
  const config = useQuery({ queryKey: ["youtube-config"], queryFn: () => getYouTubeConfig() });
  const complete = useServerFn(completeYouTubeConnection);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const connect = useCallback(async () => {
    const clientId = config.data?.clientId;
    if (!config.data?.configured || !clientId) {
      toast.error("YouTube linking is not configured yet.", {
        description: "The Google client ID and secret are missing on the backend.",
      });
      return;
    }

    const redirectUri = `${window.location.origin}/oauth/google/return`;
    const state = `youtube:${crypto.randomUUID()}`;
    const url = `${providerInfo("youtube").authorizeUrl}?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: providerInfo("youtube").scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString()}`;

    try {
      window.localStorage.removeItem(RESULT_KEY);
    } catch {
      /* ignore */
    }

    const popup = window.open(url, "google-oauth", "width=600,height=740");
    if (!popup) {
      toast.error("Allow pop-ups to connect your channel.");
      return;
    }

    setPending(true);
    try {
      const code = await waitForCode(popup, state);
      await complete({ data: { code, redirectUri } });
      toast.success("YouTube connected", { description: "Your channel is linked." });
      await queryClient.invalidateQueries({ queryKey: ["social-connections"] });
      try {
        popup.postMessage({ type: "googleOAuthAck", ok: true }, window.location.origin);
      } catch {
        /* popup gone */
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connecting failed.";
      toast.error(message);
      try {
        popup.postMessage({ type: "googleOAuthAck", ok: false, message }, window.location.origin);
      } catch {
        /* popup gone */
      }
    } finally {
      setPending(false);
      window.setTimeout(() => {
        try {
          popup.close();
        } catch {
          /* already closed */
        }
      }, 1200);
    }
  }, [config.data, complete, queryClient]);

  return { connect, pending, configured: Boolean(config.data?.configured) };
}
