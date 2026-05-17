import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Build a `renderHook` wrapper bundling a fresh `QueryClient` so each
 * test starts with an empty cache and `retry: false` (so a thrown query
 * doesn't loop and time the test out). Auth-dependent tests should
 * compose this with `<AuthProvider>` or stub `useAuth` directly.
 *
 * `gcTime: Infinity` keeps queries seeded via `setQueryData` alive for
 * the test lifetime. With the default `gcTime: 0`, a query that never
 * had an observer can be evicted on the next macrotask boundary —
 * which `await act(async ...)` reliably crosses inside a mutation —
 * leaving optimistic-update tests reading `undefined` from a cache they
 * just seeded.
 */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { wrapper: Wrapper, queryClient };
}
