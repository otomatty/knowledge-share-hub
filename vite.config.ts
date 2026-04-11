import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { readFileSync } from "node:fs";
import path from "path";
import { componentTagger } from "lovable-tagger";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

export default defineConfig(({ mode }) => ({
  cacheDir: "node_modules/.vite-knowledgehub",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: /^react$/, replacement: path.resolve(__dirname, "./node_modules/react/index.js") },
      { find: /^react-dom$/, replacement: path.resolve(__dirname, "./node_modules/react-dom/index.js") },
      { find: /^react-dom\/client$/, replacement: path.resolve(__dirname, "./node_modules/react-dom/client.js") },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(__dirname, "./node_modules/react/jsx-runtime.js") },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(__dirname, "./node_modules/react/jsx-dev-runtime.js") },
    ],
    dedupe: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    force: true,
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
}));
