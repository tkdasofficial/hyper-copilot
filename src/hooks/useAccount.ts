import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccount } from "@/lib/account.functions";
import { useSession } from "@/hooks/useSession";

/** Profile, plan tier and credit balance of the signed-in user (null for guests). */
export function useAccount() {
  const { user } = useSession();
  const fetchAccount = useServerFn(getMyAccount);

  const query = useQuery({
    queryKey: ["account", user?.id ?? "anon"],
    queryFn: () => fetchAccount(),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  return { account: query.data ?? null, loading: Boolean(user) && query.isLoading };
}
