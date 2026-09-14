import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountSummary = {
  name: string;
  email: string;
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  tier: "free" | "pro" | "unlimited";
  paymentStatus: string;
  credits: number;
  quota: number;
  used: number;
  imageCredits: number;
  videoCredits: number;
  audioCredits: number;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/** Profile + subscription + credit balance for the signed-in user. */
export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountSummary | null> => {
    const [{ data: profile }, { data: sub }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("email, full_name, avatar_url, onboarding_completed")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("subscriptions")
        .select(
          "tier, payment_status, monthly_quota, credits_used, image_credits, video_credits, audio_credits, current_period_end, cancel_at_period_end",
        )
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    if (!profile && !sub) return null;

    const quota = sub?.monthly_quota ?? 0;
    const used = sub?.credits_used ?? 0;

    return {
      name: profile?.full_name ?? profile?.email ?? "",
      email: profile?.email ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      onboardingCompleted: Boolean(profile?.onboarding_completed),
      tier: sub?.tier ?? "free",
      paymentStatus: sub?.payment_status ?? "inactive",
      credits: Math.max(quota - used, 0),
      quota,
      used,
      imageCredits: sub?.image_credits ?? 0,
      videoCredits: sub?.video_credits ?? 0,
      audioCredits: sub?.audio_credits ?? 0,
      periodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
    };
  });
