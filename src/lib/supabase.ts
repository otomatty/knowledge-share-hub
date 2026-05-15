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

// Single Supabase client instance for the whole app.
//
// - `db.schema` sets the default PostgREST schema for `.from()` calls, and makes
//   supabase-js attach `Accept-Profile` / `Content-Profile: knowledge_share_hub`
//   headers automatically. This requires the `knowledge_share_hub` schema to be
//   added to "Exposed schemas" in the Supabase dashboard (Project Settings → API).
// - Do NOT create a second `createClient()` for the `public` schema. Two client
//   instances against the same project spawn two GoTrueClients that share the
//   same localStorage key, causing "Multiple GoTrueClient instances detected"
//   warnings and unstable session state. If you need to hit another schema,
//   use `supabase.schema("public").from("...")` on this single client instead.
export const supabase = createClient<Database, "knowledge_share_hub">(
  supabaseUrl,
  supabasePublishableKey,
  {
    db: { schema: "knowledge_share_hub" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
