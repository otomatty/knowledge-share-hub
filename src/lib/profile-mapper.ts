import type { Database } from "@/integrations/supabase/types";
import type { User } from "@/types";

type ProfileRow = Database["knowledge_share_hub"]["Tables"]["profiles"]["Row"];

// Fallback when a profile row has no display_name (NULL or empty). Keeps the
// `User.display_name: string` invariant so callers don't have to defend
// against null at every avatar/label site.
export const DISPLAY_NAME_FALLBACK = "ユーザー";

export function profileToUser(row: ProfileRow): User {
  const displayName =
    row.display_name && row.display_name.length > 0
      ? row.display_name
      : DISPLAY_NAME_FALLBACK;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    display_name: displayName,
    avatar_url: row.avatar_url ?? undefined,
    current_project: row.current_project ?? undefined,
    bio: row.bio ?? undefined,
    skill_tags: row.skill_tags ?? [],
    created_at: row.created_at,
  };
}
