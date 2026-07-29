import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Keep data fresh for 5 minutes
      gcTime: 1000 * 60 * 30, // Cache stays in memory for 30 minutes
      // Returning to the tab must never trigger a refetch/loading flash.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
