import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public check used by the dynamic /auth page to decide whether to show the
 * "log in" or the "sign up" password step for a given email address.
 *
 * Requires the service role key (the `email_exists` RPC is granted to
 * service_role only, to keep it un-enumerable from the browser). When the key
 * is not configured we return `checked: false` so the UI can fall back to the
 * sign-up step instead of crashing.
 */
export const checkEmailExists = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"]) {
      console.warn("[auth] SUPABASE_SERVICE_ROLE_KEY missing - skipping email lookup");
      return { exists: false, checked: false };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: exists, error } = await (supabaseAdmin.rpc as never as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: boolean | null; error: { message: string } | null }>)("email_exists", {
        check_email: data.email,
      });

      if (error) throw new Error(error.message);
      return { exists: Boolean(exists), checked: true };
    } catch (err) {
      console.error("[auth] email lookup failed", err);
      return { exists: false, checked: false };
    }
  });
