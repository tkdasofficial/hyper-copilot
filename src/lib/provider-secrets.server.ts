/**
 * Server-only provider credentials.
 *
 * Provider API keys live in the Supabase backend (encrypted vault), never in
 * client code. The app server reads them through a service-role-only RPC and
 * caches the value in memory for a short while so every generation does not
 * pay a database round trip.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: string; expires: number }>();

/** Reads a provider key from the Supabase vault (with a one-time env import). */
export async function providerSecret(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { data, error } = await supabaseAdmin.rpc("get_provider_secret", { p_name: name });
  let value = typeof data === "string" ? data.trim() : "";

  if (!value) {
    // Migration path: if the key is still only present as an environment
    // variable, move it into the Supabase vault once, then use it from there.
    const fromEnv = (process.env[name] ?? "").trim();
    if (fromEnv) {
      await supabaseAdmin.rpc("set_provider_secret", { p_name: name, p_value: fromEnv });
      value = fromEnv;
    }
  }

  if (!value) {
    throw new Error(
      error?.message
        ? `${name} is not available from the backend: ${error.message}`
        : `${name} is not configured in the Supabase backend`,
    );
  }

  cache.set(name, { value, expires: Date.now() + TTL_MS });
  return value;
}
