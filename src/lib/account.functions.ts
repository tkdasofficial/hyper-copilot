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

    // Personal use mode: always unlimited
    const isUnlimited = true;
    const quota = isUnlimited ? 999999 : (sub?.monthly_quota ?? 0);
    const used = isUnlimited ? 0 : (sub?.credits_used ?? 0);

    return {
      name: profile?.full_name ?? profile?.email ?? "",
      email: profile?.email ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      onboardingCompleted: Boolean(profile?.onboarding_completed),
      tier: "unlimited",
      paymentStatus: "active",
      credits: 999999,
      quota,
      used,
      imageCredits: 999999,
      videoCredits: 999999,
      audioCredits: 999999,
      periodEnd: null,
      cancelAtPeriodEnd: false,
    };
  });
