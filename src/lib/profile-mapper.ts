import type { Database } from "@/integrations/supabase/types";
import type { User } from "@/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export function profileToUser(row: ProfileRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url ?? undefined,
    current_project: row.current_project ?? undefined,
    bio: row.bio ?? undefined,
    skill_tags: row.skill_tags ?? [],
    created_at: row.created_at,
  };
}
