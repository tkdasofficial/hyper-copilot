import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route code + data as soon as the user hovers/touches a link
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 30_000,
    // Keep the current page on screen while the next one loads instead of
    // flashing an empty shell under the header.
    defaultPendingMs: 1_500,
    defaultPendingMinMs: 0,
  });

  return router;
};
