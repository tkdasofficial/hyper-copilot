// Connection settings come from config.ts (no .env dependency).
// Import the supabase client from @/config or @/integrations/supabase/client
export {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_REF_ID,
  type Database,
} from "@/config";
