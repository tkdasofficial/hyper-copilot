/**
 * Unified application backend linking configuration.
 *
 * Provides single source of truth for Supabase backend connection across the entire app.
 */
export {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_REF_ID,
  type Database,
  supabase,
} from "../supabase/config/config";
