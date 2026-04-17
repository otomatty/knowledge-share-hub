import type { Database } from "@/integrations/supabase/types";
import type { Comment, Tag, Tip } from "@/types";
import { profileToUser } from "@/lib/profile-mapper";
import type { ReactionSummary } from "@/types";

type Profile = Database["knowledge_share_hub"]["Tables"]["profiles"]["Row"];

export type TipWithJoins = Database["knowledge_share_hub"]["Tables"]["tips"]["Row"] & {
  author: Profile;
  tip_tags: { tag: Database["knowledge_share_hub"]["Tables"]["tags"]["Row"] }[] | null;
};

function tagsFromJoins(
  rows:
    | { tag: Database["knowledge_share_hub"]["Tables"]["tags"]["Row"] }[]
    | null
    | undefined,
): Tag[] {
  if (!rows) return [];
  return rows.map((r) => ({
    id: r.tag.id,
    name: r.tag.name,
    category: r.tag.category,
  }));
}

export function mapTipRow(
  row: TipWithJoins,
  reactions: ReactionSummary,
  commentCount = 0,
): Tip {
  return {
    id: row.id,
    author: profileToUser(row.author),
    content: row.content,
    is_anonymous: row.is_anonymous,
    status: row.status,
    tags: tagsFromJoins(row.tip_tags),
    reactions,
    comment_count: commentCount,
    published_at: row.published_at ?? undefined,
    created_at: row.created_at,
  };
}

export type CommentWithAuthor = Database["knowledge_share_hub"]["Tables"]["comments"]["Row"] & {
  author: Profile;
};

export function mapCommentRow(
  row: CommentWithAuthor,
  reactions: ReactionSummary,
  replies: Comment[] | undefined,
): Comment {
  return {
    id: row.id,
    author: profileToUser(row.author),
    content: row.content,
    content_type: "tip",
    content_id: row.content_id,
    parent_id: row.parent_id ?? undefined,
    replies,
    reactions,
    created_at: row.created_at,
  };
}
