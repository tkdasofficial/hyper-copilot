import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { completeMetaConnection, getMetaConfig } from "@/lib/social.functions";
import { providerInfo, type SocialProvider } from "@/lib/social.shared";

const RESULT_KEY = "metaOAuthResult";
const PENDING_KEY = "metaOAuthPending";

type OAuthResult = { code?: string | null; state?: string | null; error?: string | null; at?: number };
type PendingRequest = { provider: SocialProvider; redirectUri: string; state: string };

function readResult(): OAuthResult | null {
  try {
    const raw = window.localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as OAuthResult) : null;
  } catch {
    return null;
  }
}

function clearStored() {
  try {
    window.localStorage.removeItem(RESULT_KEY);
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function waitForCode(popup: Window, state: string) {
  return new Promise<string>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const settle = (result: OAuthResult) => {
      cleanup();
      if (result.error) reject(new Error(String(result.error)));
      else if (result.code) resolve(String(result.code));
      else reject(new Error("Meta did not return an authorization code."));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "metaOAuth" || event.data?.state !== state) return;
      settle(event.data as OAuthResult);
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      const stored = readResult();
      if (stored && stored.state === state) {
        settle(stored);
        clearStored();
        return;
      }
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Meta window closed before finishing."));
    }, 400);
  });
}

/** Runs the Meta consent popup and stores the resulting connection. */
export function useMetaConnect() {
  const config = useQuery({ queryKey: ["meta-config"], queryFn: () => getMetaConfig() });
  const complete = useServerFn(completeMetaConnection);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const resuming = useRef(false);

  const finish = useCallback(
    async (provider: SocialProvider, code: string, redirectUri: string) => {
      const info = providerInfo(provider);
      const result = await complete({ data: { provider, code, redirectUri } });
      if (result.linked > 0) {
        toast.success(`${info.label} connected`, {
          description: `${result.linked} account${result.linked > 1 ? "s" : ""} linked.`,
        });
        await queryClient.invalidateQueries({ queryKey: ["social-connections"] });
      } else {
        toast.error("Nothing to link", { description: result.message ?? undefined });
      }
    },
    [complete, queryClient],
  );

  // Resume a connection that finished in a redirected tab instead of a popup.
  useEffect(() => {
    if (resuming.current) return;
    const stored = readResult();
    if (!stored) return;
    let request: PendingRequest | null = null;
    try {
      const raw = window.localStorage.getItem(PENDING_KEY);
      request = raw ? (JSON.parse(raw) as PendingRequest) : null;
    } catch {
      request = null;
    }
    clearStored();
    if (!request || stored.state !== request.state) return;
    resuming.current = true;
    if (stored.error || !stored.code) {
      toast.error(String(stored.error ?? "Connecting failed."));
      resuming.current = false;
      return;
    }
    setPending(request.provider);
    void finish(request.provider, stored.code, request.redirectUri)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Connecting failed."))
      .finally(() => {
        setPending(null);
        resuming.current = false;
      });
  }, [finish]);

  const connect = useCallback(
    async (provider: SocialProvider) => {
      const appId = config.data?.appId;
      const configId = config.data?.configId;
      if (!config.data?.configured || !appId || !configId) {
        toast.error("Meta Page linking is incomplete.", {
          description: "Add the Facebook Login for Business configuration ID.",
        });
        return;
      }

      const info = providerInfo(provider);
      const redirectUri = `${window.location.origin}/oauth/meta/return`;
      const state = `${provider}:${crypto.randomUUID()}`;
      const authParams: Record<string, string> = {
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: "code",
        auth_type: "rerequest",
        return_scopes: "true",
        state,
      };
      if (provider === "threads") authParams["scope"] = info.scopes.join(",");
      else authParams["config_id"] = configId;
      const url = `${info.authorizeUrl}?${new URLSearchParams(authParams).toString()}`;

      clearStored();
      try {
        window.localStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ provider, redirectUri, state } satisfies PendingRequest),
        );
      } catch {
        /* ignore */
      }

      const popup = window.open(url, "meta-oauth", "width=600,height=740");
      if (!popup) {
        toast.error("Allow pop-ups to connect your account.");
        return;
      }

      setPending(provider);
      const ack = (ok: boolean, message?: string) => {
        try {
          popup.postMessage({ type: "metaOAuthAck", ok, message }, window.location.origin);
        } catch {
          /* popup gone */
        }
      };
      try {
        const code = await waitForCode(popup, state);
        await finish(provider, code, redirectUri);
        ack(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connecting failed.";
        toast.error(message);
        ack(false, message);
      } finally {
        clearStored();
        setPending(null);
        window.setTimeout(() => {
          try {
            popup.close();
          } catch {
            /* already closed */
          }
        }, 1500);
      }

    },
    [config.data, finish],
  );

  return { connect, pending, configured: Boolean(config.data?.configured) };
}
