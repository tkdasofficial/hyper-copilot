import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Facebook, Instagram, Loader2, AtSign, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { useMetaConnect } from "@/components/hyper/useMetaConnect";
import { disconnectSocialAccount, listSocialConnections } from "@/lib/social.functions";
import { PROVIDERS, type SocialProvider } from "@/lib/social.shared";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () =>
    pageHead({
      path: "/integrations",
      title: "Integrations \u2014 Connect Facebook, Instagram & Threads",
      description:
        "Link your Facebook Page, Instagram Business account and Threads profile to publish and automate directly from Hyper Copilot.",
      noindex: true,
      keywords: ["social integrations", "connect Instagram", "connect Facebook Page", "Threads API"],
    }),
  component: IntegrationsPage,
});

const ICONS: Record<SocialProvider, typeof Facebook> = {
  facebook_page: Facebook,
  instagram: Instagram,
  threads: AtSign,
};

function IntegrationsPage() {
  const fetchConnections = useServerFn(listSocialConnections);
  const disconnect = useServerFn(disconnectSocialAccount);
  const queryClient = useQueryClient();
  const { connect, pending, configured } = useMetaConnect();

  const connections = useQuery({
    queryKey: ["social-connections"],
    queryFn: () => fetchConnections(),
  });

  async function onDisconnect(id: string) {
    try {
      await disconnect({ data: { id } });
      await queryClient.invalidateQueries({ queryKey: ["social-connections"] });
      toast.success("Account unlinked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unlink the account.");
    }
  }

  return (
    <StudioLayout>
      {!configured ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-3 text-[12.5px] text-muted-foreground">
          Linking is unavailable right now.
        </p>
      ) : null}

      <div className="mt-5 space-y-2.5">
        {PROVIDERS.map((provider) => {
          const Icon = ICONS[provider.id];
          const linked = (connections.data ?? []).filter((c) => c.provider === provider.id);
          const busy = pending === provider.id;

          return (
            <section
              key={provider.id}
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                  <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <p className="truncate text-[13.5px] font-bold">{provider.label}</p>
                  {linked.length ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest text-primary">
                      <Check className="h-3 w-3" strokeWidth={3} />
                      Linked
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => connect(provider.id)}
                  disabled={busy}
                  aria-label={`Connect ${provider.label}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[12.5px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plug className="h-3.5 w-3.5" strokeWidth={2.2} />
                  )}
                  {linked.length ? "Add" : "Connect"}
                </button>
              </div>

              {linked.length ? (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {linked.map((account) => (
                    <li key={account.id} className="flex items-center gap-2.5">
                      {account.avatarUrl ? (
                        <img
                          src={account.avatarUrl}
                          alt={`${account.displayName ?? "Account"} avatar`}
                          className="h-7 w-7 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="h-7 w-7 rounded-full bg-surface-2" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                        {account.displayName ?? account.externalId}
                        {account.username ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            @{account.username}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDisconnect(account.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground hover:border-border-strong hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" strokeWidth={2} />
                        Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </StudioLayout>
  );
}
