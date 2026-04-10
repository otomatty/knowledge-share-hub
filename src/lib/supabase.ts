import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_SUPABASE_ANON_KEY) environment variables",
  );
}

// App tables live in the dedicated knowledge_share_hub schema.
export const supabase = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
  {
    db: { schema: "knowledge_share_hub" },
  },
);

// Shared profile/auth-adjacent tables stay in public.
export const supabasePublic = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
  {
    db: { schema: "public" },
  },
);
