/**
 * Hardcoded public Supabase project configuration.
 *
 * These values are the *public* project identifiers (safe to ship in client
 * code). Server-only keys (service role) are never placed here.
 *
 * The exported `supabase` client is the app's single browser client instance —
 * re-exported so the whole app can import its backend connection from here
 * without a second auth/localStorage session being created.
 */
export const SUPABASE_URL = "https://uqyuwxztevkokzqldibh.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeXV3eHp0ZXZrb2t6cWxkaWJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMTc5NDQsImV4cCI6MjEwNDU5Mzk0NH0.7iDkmwdO5TErBma5UL9xLQxj7qtdpf5y1bXEr6NRNCo";

export const SUPABASE_REF_ID = "uqyuwxztevkokzqldibh";

/**
 * The external "Video Engine" render repository is reached ONLY by the
 * `video-agent` Supabase Edge Function, which holds the `GITHUB_PAT` secret.
 * No GitHub identifier, endpoint or token belongs in app code.
 */

export { supabase } from "@/integrations/supabase/client";
export type { Database } from "@/integrations/supabase/types";
