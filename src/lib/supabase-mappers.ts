import type { Database } from "@/integrations/supabase/types";
import type {
  Article,
  Book,
  BookChapter,
  Comment,
  Memo,
  MemoEntry,
  Tag,
  Tip,
} from "@/types";
import { profileToUser } from "@/lib/profile-mapper";
import type { ReactionSummary } from "@/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type TipWithJoins = Database["public"]["Tables"]["tips"]["Row"] & {
  author: Profile;
  tip_tags: { tag: Database["public"]["Tables"]["tags"]["Row"] }[] | null;
};

export type ArticleWithJoins = Database["public"]["Tables"]["articles"]["Row"] & {
  author: Profile;
  article_tags: { tag: Database["public"]["Tables"]["tags"]["Row"] }[] | null;
};

export type MemoWithJoins = Database["public"]["Tables"]["memos"]["Row"] & {
  author: Profile;
  memo_tags: { tag: Database["public"]["Tables"]["tags"]["Row"] }[] | null;
  memo_entries: Database["public"]["Tables"]["memo_entries"]["Row"][] | null;
};

export type BookWithJoins = Database["public"]["Tables"]["books"]["Row"] & {
  author: Profile;
  book_chapters:
    | (Database["public"]["Tables"]["book_chapters"]["Row"] & {
        article: ArticleWithJoins | null;
      })[]
    | null;
};

function tagsFromJoins(
  rows: { tag: Database["public"]["Tables"]["tags"]["Row"] }[] | null | undefined,
): Tag[] {
  if (!rows) return [];
  return rows.map((r) => ({
    id: r.tag.id,
    name: r.tag.name,
  }));
}

export function mapTipRow(row: TipWithJoins, reactions: ReactionSummary): Tip {
  return {
    id: row.id,
    author: profileToUser(row.author),
    content: row.content,
    is_anonymous: row.is_anonymous,
    status: row.status,
    tags: tagsFromJoins(row.tip_tags),
    reactions,
    published_at: row.published_at ?? undefined,
    created_at: row.created_at,
  };
}

export function mapArticleRow(
  row: ArticleWithJoins,
  reactions: ReactionSummary,
  commentCount: number,
): Article {
  return {
    id: row.id,
    author: profileToUser(row.author),
    title: row.title,
    content: row.content,
    is_anonymous: row.is_anonymous,
    status: row.status,
    tags: tagsFromJoins(row.article_tags),
    reactions,
    comment_count: commentCount,
    published_at: row.published_at ?? undefined,
    created_at: row.created_at,
  };
}

export function mapMemoRow(
  row: MemoWithJoins,
  reactions: ReactionSummary,
  commentCount: number,
): Memo {
  const entries = (row.memo_entries ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (e): MemoEntry => ({
        id: e.id,
        content: e.content,
        order: e.sort_order,
        created_at: e.created_at,
      }),
    );

  return {
    id: row.id,
    author: profileToUser(row.author),
    title: row.title,
    is_anonymous: row.is_anonymous,
    status: row.status,
    tags: tagsFromJoins(row.memo_tags),
    entries,
    reactions,
    comment_count: commentCount,
    published_at: row.published_at ?? undefined,
    created_at: row.created_at,
  };
}

export function mapBookRow(row: BookWithJoins, reactionsByArticleId: Record<string, ReactionSummary>, commentCounts: Record<string, number>): Book {
  const chapters: BookChapter[] = (row.book_chapters ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ch) => {
      const ar = ch.article;
      if (!ar) {
        throw new Error("book chapter missing article");
      }
      const arx = ar as ArticleWithJoins;
      return {
        id: ch.id,
        order: ch.sort_order,
        article: mapArticleRow(
          arx,
          reactionsByArticleId[ar.id] ?? {
            helped: 0,
            clear: 0,
            learned: 0,
            nice: 0,
          },
          commentCounts[ar.id] ?? 0,
        ),
      };
    });

  return {
    id: row.id,
    author: profileToUser(row.author),
    title: row.title,
    description: row.description,
    cover_image_url: row.cover_image_url ?? undefined,
    status: row.status,
    chapters,
    published_at: row.published_at ?? undefined,
    created_at: row.created_at,
  };
}

export type CommentWithAuthor = Database["public"]["Tables"]["comments"]["Row"] & {
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
    content_type: row.content_type as "memo" | "article",
    content_id: row.content_id,
    parent_id: row.parent_id ?? undefined,
    replies,
    reactions,
    created_at: row.created_at,
  };
}
