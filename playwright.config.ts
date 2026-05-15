import { createLovableConfig } from "lovable-agent-playwright-config/config";

// E2E walks the golden path against a dev server with MSW intercepting
// every Supabase REST/auth call. The dev server gets a placeholder
// VITE_SUPABASE_URL that the MSW handlers (src/mocks/handlers.ts) match.
export default createLovableConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:8080",
  },
  webServer: {
    command:
      "VITE_E2E=true VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=msw-anon bun run dev",
    port: 8080,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
