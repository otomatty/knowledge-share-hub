import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Build a `renderHook` wrapper bundling a fresh `QueryClient` so each
 * test starts with an empty cache and `retry: false` (so a thrown query
 * doesn't loop and time the test out). Auth-dependent tests should
 * compose this with `<AuthProvider>` or stub `useAuth` directly.
 */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
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
