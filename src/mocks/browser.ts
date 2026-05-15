import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

// Browser-side MSW worker. Only started by `src/main.tsx` when
// `import.meta.env.VITE_E2E === "true"` so production / dev runs are
// untouched.
export const worker = setupWorker(...handlers);
