import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { providerInfo } from "@/lib/social.shared";

/** Public Google client id plus whether the backend holds the secret. */
export const getYouTubeConfig = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { callYouTube } = await import("@/lib/youtube.server");
    const out = await callYouTube<{ clientId: string; configured: boolean }>("config");
    return { clientId: out.clientId ?? "", configured: Boolean(out.configured) };
  } catch {
    return { clientId: "", configured: false };
  }
});

/** Exchanges the Google authorization code and stores the channel + refresh token. */
export const completeYouTubeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; redirectUri: string }) => {
    if (!input?.code) throw new Error("Missing authorization code");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { callYouTube } = await import("@/lib/youtube.server");
    const channel = await callYouTube<{
      refreshToken: string;
      channelId: string;
      title: string | null;
      customUrl: string | null;
      avatarUrl: string | null;
    }>("exchange", { code: data.code, redirectUri: data.redirectUri });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("social_connections").upsert(
      [
        {
          user_id: context.userId,
          provider: "youtube",
          external_id: channel.channelId,
          display_name: channel.title,
          username: channel.customUrl,
          avatar_url: channel.avatarUrl,
          // Google long-lived credential; refreshed server-side on every upload.
          access_token: channel.refreshToken,
          token_expires_at: null,
          scopes: providerInfo("youtube").scopes,
          status: "linked",
          metadata: { channelId: channel.channelId, credential: "refresh_token" } as never,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "user_id,provider,external_id" },
    );
    if (error) throw new Error(error.message);

    return { linked: 1, message: null as string | null };
  });
