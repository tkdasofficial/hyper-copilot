import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GRAPH_VERSION,
  providerInfo,
  type SocialConnection,
  type SocialProvider,
} from "@/lib/social.shared";

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const THREADS_GRAPH = "https://graph.threads.net";

type RawRow = {
  id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
};

function toConnection(row: RawRow): SocialConnection {
  return {
    id: row.id,
    provider: row.provider as SocialProvider,
    externalId: row.external_id,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    status: row.status,
    createdAt: row.created_at,
  };
}

type MetaCredentials = { appId: string; appSecret: string; configId: string };

/** Reads Meta credentials from the encrypted backend provider store. */
async function metaCredentials(): Promise<MetaCredentials> {
  const { providerSecret } = await import("@/lib/provider-secrets.server");
  const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "");
  const [appId, appSecret, configId] = await Promise.all([
    providerSecret("META_APP_ID"),
    providerSecret("META_APP_SECRET"),
    providerSecret("META_LOGIN_CONFIG_ID"),
  ]);
  return { appId: clean(appId), appSecret: clean(appSecret), configId: clean(configId) };
}

/** Public Meta app id (safe in the browser) plus whether the server secrets exist. */
export const getMetaConfig = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { appId, appSecret, configId } = await metaCredentials();
    return { appId, configId, configured: Boolean(appId && appSecret && configId) };
  } catch {
    return { appId: "", configId: "", configured: false };
  }
});

/** Every social account the signed-in user has linked. */
export const listSocialConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SocialConnection[]> => {
    const { data, error } = await context.supabase
      .from("social_connections")
      .select("id, provider, external_id, display_name, username, avatar_url, status, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toConnection(row as RawRow));
  });

/** Turns raw Meta errors into wording the person in the app can act on. */
function friendlyMetaError(status: number, body: string): string {
  let message = body;
  try {
    message = JSON.parse(body)?.error?.message ?? body;
  } catch {
    /* keep raw text */
  }
  if (/client secret/i.test(message)) {
    return "The saved Meta app secret does not match this app. Update it in the app's secure settings and try again.";
  }
  if (/client id|application id/i.test(message)) {
    return "The saved Meta app ID is not valid. Update it in the app's secure settings and try again.";
  }
  if (/redirect/i.test(message)) {
    return "This site's return address is not listed in your Meta app's allowed redirect URIs.";
  }
  return `Meta could not complete the request [${status}]: ${message}`;
}

type GraphResponse = Record<string, unknown> & {
  data?: unknown[];
  access_token?: string;
  id?: string;
  name?: string;
  picture?: { data?: { url?: string } };
  paging?: { cursors?: { after?: string } };
  granular_scopes?: Array<{ scope?: string; target_ids?: unknown[] }>;
};

async function graphJson(url: string): Promise<GraphResponse> {
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) throw new Error(friendlyMetaError(res.status, body));
  return (body ? JSON.parse(body) : {}) as GraphResponse;
}

async function exchangeFacebookCode(
  code: string,
  redirectUri: string,
  credentials: MetaCredentials,
) {
  const params = new URLSearchParams({
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const short = await graphJson(`${GRAPH}/oauth/access_token?${params.toString()}`);
  // Upgrade to a long-lived (~60 day) user token.
  const longParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
    fb_exchange_token: short.access_token,
  });
  const long = await graphJson(`${GRAPH}/oauth/access_token?${longParams.toString()}`);
  return {
    token: (long.access_token ?? short.access_token) as string,
    expiresIn: Number(long.expires_in ?? short.expires_in ?? 0),
  };
}

async function exchangeThreadsCode(
  code: string,
  redirectUri: string,
  credentials: MetaCredentials,
) {
  const res = await fetch(`${THREADS_GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.appId,
      client_secret: credentials.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyMetaError(res.status, text));
  const json = JSON.parse(text);
  // Trade for a long-lived Threads token when possible.
  try {
    const long = await graphJson(
      `${THREADS_GRAPH}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(
        credentials.appSecret,
      )}&access_token=${encodeURIComponent(json.access_token)}`,
    );
    return { token: long.access_token as string, expiresIn: Number(long.expires_in ?? 0) };
  } catch {
    return { token: json.access_token as string, expiresIn: Number(json.expires_in ?? 0) };
  }
}

type Discovered = {
  externalId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  token: string;
  metadata: Record<string, unknown>;
};

const PAGE_FIELDS = "id,name,access_token,picture{url}";
const INSTAGRAM_FIELDS =
  "instagram_business_account{id,username,profile_picture_url},connected_instagram_account{id,username,profile_picture_url}";

type MetaPageRecord = Record<string, unknown> & {
  id?: string | number;
  name?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id?: string; username?: string; profile_picture_url?: string };
  connected_instagram_account?: { id?: string; username?: string; profile_picture_url?: string };
};

/** Collects Pages from the user edge, then from any businesses they administer. */
async function collectPages(
  userToken: string,
  includeInstagram: boolean,
): Promise<MetaPageRecord[]> {
  const token = encodeURIComponent(userToken);
  const found = new Map<string, MetaPageRecord>();

  const absorb = (list: unknown[] | undefined) => {
    for (const page of list ?? []) {
      const p = page as MetaPageRecord;
      if (p?.id) found.set(String(p.id), p);
    }
  };

  const pages = await graphJson(
    `${GRAPH}/me/accounts?fields=${encodeURIComponent(PAGE_FIELDS)}&limit=100&access_token=${token}`,
  );
  absorb(pages.data);

  if (found.size === 0) {
    try {
      const businesses = await graphJson(
        `${GRAPH}/me/businesses?fields=${encodeURIComponent(`owned_pages{${PAGE_FIELDS}},client_pages{${PAGE_FIELDS}}`)}&limit=50&access_token=${token}`,
      );
      for (const biz of (businesses.data as Array<Record<string, { data?: unknown[] }>>) ?? []) {
        absorb(biz?.owned_pages?.data);
        absorb(biz?.client_pages?.data);
      }
    } catch {
      /* business_management not granted — nothing more to try */
    }
  }

  if (includeInstagram) {
    await Promise.all(
      [...found.entries()].map(async ([pageId, page]) => {
        try {
          const details = await graphJson(
            `${GRAPH}/${encodeURIComponent(pageId)}?fields=${encodeURIComponent(INSTAGRAM_FIELDS)}&access_token=${encodeURIComponent(page.access_token ?? userToken)}`,
          );
          found.set(pageId, { ...page, ...details });
        } catch {
          // Keep the Page in the result; it may simply have no linked Instagram account.
        }
      }),
    );
  }

  return [...found.values()];
}

async function discoverAccounts(
  provider: SocialProvider,
  userToken: string,
): Promise<Discovered[]> {
  if (provider === "threads") {
    const me = await graphJson(
      `${THREADS_GRAPH}/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(userToken)}`,
    );
    return [
      {
        externalId: String(me.id),
        displayName: me.username ?? "Threads profile",
        username: me.username ?? null,
        avatarUrl: me.threads_profile_picture_url ?? null,
        token: userToken,
        metadata: {},
      },
    ];
  }

  const list = await collectPages(userToken, provider === "instagram");

  if (provider === "facebook_page") {
    return list.map((page) => ({
      externalId: String(page.id),
      displayName: page.name ?? null,
      username: null,
      avatarUrl: page.picture?.data?.url ?? null,
      token: page.access_token ?? userToken,
      metadata: { pageId: page.id },
    }));
  }

  return list
    .map((page) => ({
      page,
      ig: page.instagram_business_account ?? page.connected_instagram_account,
    }))
    .filter((entry) => entry.ig?.id)
    .map(({ page, ig }) => ({
      externalId: String(ig.id),
      displayName: ig.username ?? page.name ?? null,
      username: ig.username ?? null,
      avatarUrl: ig.profile_picture_url ?? null,
      token: page.access_token ?? userToken,
      metadata: { pageId: page.id, pageName: page.name },
    }));
}

/** Explains why Meta returned no accounts, using the permissions it actually granted. */
async function explainEmptyDiscovery(
  provider: SocialProvider,
  userToken: string,
  credentials: MetaCredentials,
): Promise<string> {
  const token = encodeURIComponent(userToken);
  const granted: string[] = [];
  const declined: string[] = [];
  try {
    const perms = await graphJson(`${GRAPH}/me/permissions?access_token=${token}`);
    for (const row of (perms.data as Array<{ status?: string; permission?: string }>) ?? []) {
      if (row?.status === "granted") granted.push(String(row.permission));
      else declined.push(String(row.permission));
    }
  } catch {
    /* permissions edge unavailable */
  }

  const needed =
    provider === "instagram" ? ["pages_show_list", "instagram_basic"] : ["pages_show_list"];
  const missing = needed.filter((scope) => !granted.includes(scope));
  if (missing.length > 0) {
    return `Meta did not grant ${missing.join(" and ")}${
      declined.length ? ` (declined: ${declined.join(", ")})` : ""
    }. In your Meta app add the Facebook Login for Business product and request these permissions, then connect again and approve every step.`;
  }

  try {
    const appToken = `${credentials.appId}|${credentials.appSecret}`;
    const debug = await graphJson(
      `${GRAPH}/debug_token?input_token=${token}&access_token=${encodeURIComponent(appToken)}`,
    );
    const granular = Array.isArray(debug?.data?.granular_scopes) ? debug.data.granular_scopes : [];
    const pageGrant = granular.find(
      (scope: { scope?: string }) => scope?.scope === "pages_show_list",
    ) as { scope?: string; target_ids?: unknown[] } | undefined;
    if (pageGrant && (!Array.isArray(pageGrant.target_ids) || pageGrant.target_ids.length === 0)) {
      return "Meta granted Page permission but shared no Page with Hyper Copilot. Connect again and select at least one Page in Meta's Page picker.";
    }
  } catch {
    /* token diagnostics unavailable */
  }

  if (provider === "instagram") {
    return "Permissions were granted, but no Instagram Business or Creator account is attached to any Page you selected. In the Instagram app switch the account to Business or Creator and link it to your Facebook Page, then connect again.";
  }
  return "Permissions were granted, but Meta returned no Page. This happens when the Facebook account manages no Page, or the app is in development mode and your account is not added as a tester/admin with a Page. Create or get admin access to a Page, add your account under App roles, then connect again.";
}

/**
 * Completes the Meta OAuth round-trip: exchanges the one-time code for a
 * long-lived token, discovers the accounts it grants access to and stores them.
 */
export const completeMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: SocialProvider; code: string; redirectUri: string }) => {
    if (!input?.code) throw new Error("Missing authorization code");
    providerInfo(input.provider);
    return input;
  })
  .handler(async ({ data, context }) => {
    const credentials = await metaCredentials();
    if (!credentials.appId || !credentials.appSecret) {
      throw new Error("Meta app credentials are not configured on the server.");
    }
    if (data.provider !== "threads" && !credentials.configId) {
      throw new Error(
        "Facebook Login for Business is not configured. Add the Login Configuration ID from the Meta app dashboard.",
      );
    }

    const { token, expiresIn } =
      data.provider === "threads"
        ? await exchangeThreadsCode(data.code, data.redirectUri, credentials)
        : await exchangeFacebookCode(data.code, data.redirectUri, credentials);

    const accounts = await discoverAccounts(data.provider, token);
    if (accounts.length === 0) {
      return {
        linked: 0,
        message: await explainEmptyDiscovery(data.provider, token, credentials),
      };
    }

    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = accounts.map((acct) => ({
      user_id: context.userId,
      provider: data.provider,
      external_id: acct.externalId,
      display_name: acct.displayName,
      username: acct.username,
      avatar_url: acct.avatarUrl,
      access_token: acct.token,
      token_expires_at: expiresAt,
      scopes: providerInfo(data.provider).scopes,
      status: "linked",
      metadata: acct.metadata as Record<string, never>,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from("social_connections")
      .upsert(rows, { onConflict: "user_id,provider,external_id" });
    if (error) throw new Error(error.message);

    return { linked: rows.length, message: null as string | null };
  });

/** Removes a linked account. */
export const disconnectSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("social_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
