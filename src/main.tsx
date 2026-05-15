import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function render() {
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

// MSW for Playwright E2E. Tree-shaken out of production: Vite statically
// inlines `import.meta.env.VITE_E2E`, so the dynamic `import("./mocks/...")`
// only ships when the dev server is launched with `VITE_E2E=true`.
if (import.meta.env.VITE_E2E === "true") {
  import("./mocks/browser").then(({ worker }) =>
    worker.start({ onUnhandledRequest: "bypass" }).then(render),
  );
} else {
  render();
}
