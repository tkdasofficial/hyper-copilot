import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public check used by the dynamic /auth page to decide whether to show the
 * "log in" or the "sign up" password step for a given email address.
 *
 * Checks registered user storage and the `email_exists` Supabase RPC if
 * service role key is available.
 */
export const checkEmailExists = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { isEmailRegistered } = await import("@/lib/registered-users.server");
      const exists = await isEmailRegistered(data.email);
      return { exists, checked: true };
    } catch (err) {
      console.error("[auth] email lookup failed", err);
      return { exists: false, checked: false };
    }
  });

export const recordEmailRegistered = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { recordRegisteredEmail } = await import("@/lib/registered-users.server");
      await recordRegisteredEmail(data.email);
      return { success: true };
    } catch (err) {
      console.error("[auth] record email failed", err);
      return { success: false };
    }
  });
