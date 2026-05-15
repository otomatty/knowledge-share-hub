import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // src/lib/supabase.ts throws at module load when these are missing.
    // Hook/context tests import it transitively, so the singleton needs
    // *something* — the mocked createClient ignores the values.
    env: {
      VITE_SUPABASE_URL: "http://supabase.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**", "src/hooks/**", "src/contexts/**"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "src/integrations/**",
        // shadcn-vendored utilities — no app-specific logic worth gating
        // on; tested upstream.
        "src/hooks/use-toast.ts",
        "src/hooks/use-mobile.tsx",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
