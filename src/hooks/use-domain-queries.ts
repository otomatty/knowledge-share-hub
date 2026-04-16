import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
  fetchTagUsageCounts,
  fetchReactionCountsReceivedByAuthors,
} from "@/lib/reaction-aggregates";
import {
  mapCommentRow,
  mapTipRow,
  type CommentWithAuthor,
  type TipWithJoins,
} from "@/lib/supabase-mappers";
import type {
  Comment,
  ReactionType,
  Tag,
  Tip,
  User,
} from "@/types";
import { profileToUser } from "@/lib/profile-mapper";

const emptyRx = emptyReactionSummary;

export function useUserReactionTypesOnContent(
  userId: string | undefined,
  contentType: string,
  contentId: string | undefined,
) {
  return useQuery({
    queryKey: ["user-reactions", userId, contentType, contentId],
    queryFn: async (): Promise<Set<ReactionType>> => {
      const { data, error } = await supabase
        .from("reactions")
        .select("reaction_type")
        .eq("user_id", userId!)
        .eq("content_type", contentType)
        .eq("content_id", contentId!);
      if (error) throw error;
      return new Set(
        (data ?? []).map((r) => r.reaction_type as ReactionType),
      );
    },
    enabled: !!userId && !!contentId,
  });
}

export function useCommentsThread(
  contentType: "tip",
  contentId: string | undefined,
) {
  return useQuery({
    queryKey: ["comments", "thread", contentType, contentId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from("comments")
        .select("*, author:profiles!comments_author_id_fkey(*)")
        .eq("content_type", contentType)
        .eq("content_id", contentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data as CommentWithAuthor[];
      const commentIds = rows.map((r) => r.id);
      const rx = await fetchReactionSummaries("comment", commentIds);

      const byParent = new Map<string | null, CommentWithAuthor[]>();
      for (const r of rows) {
        const p = r.parent_id as string | null;
        const key = p ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(r);
      }
      for (const [, list] of byParent) {
        list.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      }

      const build = (row: CommentWithAuthor): Comment => {
        const children = byParent.get(row.id) ?? [];
        const replies = children.map(build);
        return mapCommentRow(
          row,
          rx[row.id] ?? emptyRx(),
          replies.length > 0 ? replies : undefined,
        );
      };

      const roots = byParent.get(null) ?? [];
      return roots.map(build);
    },
    enabled: !!contentId,
  });
}

export function useTipsMapped() {
  return useQuery({
    queryKey: ["tips", "domain"],
    queryFn: async (): Promise<Tip[]> => {
      const { data, error } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data as TipWithJoins[];
      const ids = rows.map((r) => r.id);
      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", ids),
        fetchCommentCounts("tip", ids),
      ]);
      return rows.map((r) =>
        mapTipRow(r, rx[r.id] ?? emptyRx(), cc[r.id] ?? 0),
      );
    },
  });
}

export function useTipByIdMapped(id: string | undefined) {
  return useQuery({
    queryKey: ["tips", "domain", id],
    queryFn: async (): Promise<Tip> => {
      const { data, error } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      const row = data as TipWithJoins;
      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", [row.id]),
        fetchCommentCounts("tip", [row.id]),
      ]);
      return mapTipRow(row, rx[row.id] ?? emptyRx(), cc[row.id] ?? 0);
    },
    enabled: !!id,
  });
}

export function useProfileByUsername(username: string | undefined) {
  return useQuery({
    queryKey: ["profile", "username", username],
    queryFn: async (): Promise<{ profile: User; userId: string }> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username!)
        .single();
      if (error) throw error;
      return { profile: profileToUser(data), userId: data.id };
    },
    enabled: !!username,
  });
}

export function useTrendingTags() {
  return useQuery({
    queryKey: ["tags", "trending"],
    queryFn: async () => {
      const rows = await fetchTagUsageCounts();
      return rows
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((r) => ({
          tag: { id: r.tag_id, name: r.name } satisfies Tag,
          count: r.count,
        }));
    },
  });
}

export function useWeeklyUserRanking() {
  return useQuery({
    queryKey: ["users", "weekly-ranking"],
    queryFn: async (): Promise<{ user: User; reactionCount: number }[]> => {
      const totals = await fetchReactionCountsReceivedByAuthors();
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*");
      if (error) throw error;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return totals
        .map((t) => {
          const p = byId.get(t.user_id);
          if (!p) return null;
          return {
            user: profileToUser(p),
            reactionCount: t.total,
          };
        })
        .filter((x): x is { user: User; reactionCount: number } => x !== null)
        .sort((a, b) => b.reactionCount - a.reactionCount)
        .slice(0, 5);
    },
  });
}
