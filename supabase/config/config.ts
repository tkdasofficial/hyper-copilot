/**
 * Single source of truth for this project's PUBLIC Supabase connection.
 *
 * Every client (browser, SSR, server functions) reads the project URL and the
 * publishable (anon) key from here — there is no `.env` dependency.
 *
 * Only public identifiers live here. Server-only credentials (service role
 * key, provider API keys) stay in the backend secret store and are never
 * placed in this file.
 */
export const SUPABASE_URL = "https://uqyuwxztevkokzqldibh.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeXV3eHp0ZXZrb2t6cWxkaWJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMTc5NDQsImV4cCI6MjEwNDU5Mzk0NH0.7iDkmwdO5TErBma5UL9xLQxj7qtdpf5y1bXEr6NRNCo";

/** Alias — Supabase calls the anon key the "publishable" key in newer docs. */
export const SUPABASE_PUBLISHABLE_KEY = SUPABASE_ANON_KEY;

export const SUPABASE_REF_ID = "uqyuwxztevkokzqldibh";

/**
 * The external "Video Engine" render repository is reached ONLY by the
 * `video-agent` Supabase Edge Function, which holds the `GITHUB_PAT` secret.
 * No GitHub identifier, endpoint or token belongs in app code.
 */

export type { Database } from "@/integrations/supabase/types";
