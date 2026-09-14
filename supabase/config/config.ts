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
 * External GitHub "Video Engine" repository that renders Video Agent jobs.
 * Owner/name are public identifiers, so they live here.
 */
export const GITHUB_REPO_OWNER = "TKDasOfficial";
export const GITHUB_REPO_NAME = "video-agent";
export const GITHUB_DISPATCH_EVENT = "video_agent_render";
export const GITHUB_DISPATCH_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`;

/**
 * The access token is deliberately NOT hardcoded here: this module is imported
 * by browser code, so a literal PAT would be published in the JS bundle and
 * GitHub would revoke it. It is read server-side from the `GITHUB_PAT` secret.
 */
export const GITHUB_PAT_SECRET_NAME = "GITHUB_PAT";

export { supabase } from "@/integrations/supabase/client";
export type { Database } from "@/integrations/supabase/types";
