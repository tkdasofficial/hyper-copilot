import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Warm the code chunks for the main studio pages once the app is idle, so
 * sidebar/drawer navigation swaps instantly instead of downloading on tap.
 */
const ROUTES = [
  "/dashboard",
  "/image",
  "/virtual-model",
  "/video",
  "/video-agent",
  "/audio",
  "/library",
  "/pricing",
  "/settings",
] as const;

export function usePrefetchRoutes() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const to of ROUTES) {
        void router.preloadRoute({ to }).catch(() => {});
      }
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 2000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }

    const t = window.setTimeout(run, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [router]);
}
