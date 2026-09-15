import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccount } from "@/lib/account.functions";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";

/** Profile, plan tier and credit balance of the signed-in user (null for guests). */
export function useAccount() {
  const { user } = useSession();
  const fetchAccount = useServerFn(getMyAccount);

  const query = useQuery({
    queryKey: ["account", user?.id ?? "anon"],
    queryFn: async () => {
      // The bearer token is attached client-side; without a live session the
      // protected server fn would 401, so resolve to null instead.
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return null;
      return await fetchAccount();
    },
    enabled: Boolean(user),
    retry: false,
    staleTime: 30_000,
  });

  return { account: query.data ?? null, loading: Boolean(user) && query.isLoading };
}

