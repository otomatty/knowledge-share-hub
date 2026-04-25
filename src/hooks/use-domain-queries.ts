import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
  fetchTagUsageCounts,
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

/**
 * Issue #14: scoped variant of `useTipsMapped` for the user-profile page.
 * The previous implementation fetched every published tip and filtered
 * `author.id === userId && !is_anonymous` on the client, so the profile
 * cost grew linearly with the global tip count even though the page only
 * ever rendered one user's tips.
 *
 * `includeAnonymous` defaults to false because the only current caller
 * (public profile) wants to keep anonymous tips unattributed — exposing
 * them on the author's own profile would defeat the anonymity. Owner
 * archive uses `useUserArchive` instead, which intentionally includes
 * drafts + anonymous tips for backup completeness.
 */
export function useTipsByUser(
  userId: string | undefined,
  opts?: { includeAnonymous?: boolean },
) {
  const includeAnonymous = opts?.includeAnonymous ?? false;
  return useQuery({
    queryKey: ["tips", "domain", "by-user", userId, includeAnonymous],
    enabled: !!userId,
    queryFn: async (): Promise<Tip[]> => {
      let q = supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .eq("author_id", userId!);
      if (!includeAnonymous) q = q.eq("is_anonymous", false);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
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

/**
 * Issue #14: top `limit` tips published within the last `days` days,
 * ranked by total reaction count desc. Powers the "今週の気づき" sidebar.
 *
 * The time filter runs server-side (`published_at >= cutoff`); reaction
 * aggregation runs client-side over the filtered set. That set is
 * bounded by the publish-window, which is small in practice (tens to
 * low hundreds), so a client aggregate is cheap. If the 7-day window
 * ever grows large enough that the second-stage `fetchReactionSummaries`
 * dominates, replace this with a Postgres function that returns the
 * pre-ranked tip ids and refetch full rows by `.in("id", ids)`.
 *
 * Comment counts are only fetched for the final top-`limit` slice —
 * they're a presentation detail that doesn't affect ranking, so paying
 * `fetchCommentCounts` over the full window would be wasted work.
 */
export function useRecentTopTips(days: number, limit: number) {
  return useQuery({
    queryKey: ["tips", "domain", "recent-top", days, limit],
    queryFn: async (): Promise<Tip[]> => {
      const cutoffIso = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data, error } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .gte("published_at", cutoffIso)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw error;
      const rows = data as TipWithJoins[];
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const rx = await fetchReactionSummaries("tip", ids);

      const totalRx = (id: string) => {
        const s = rx[id];
        if (!s) return 0;
        return s.same_thought + s.new_view + s.try_it + s.learned;
      };

      // Sort by reaction total desc, breaking ties by recency (already
      // the row order, but be explicit) and then `id` for a stable total
      // order — otherwise two tips with identical reaction count and
      // identical `published_at` would render in arbitrary order across
      // refetches.
      const ranked = [...rows].sort((a, b) => {
        const d = totalRx(b.id) - totalRx(a.id);
        if (d !== 0) return d;
        const t =
          new Date(b.published_at ?? b.created_at).getTime() -
          new Date(a.published_at ?? a.created_at).getTime();
        if (t !== 0) return t;
        return b.id.localeCompare(a.id);
      });
      const top = ranked.slice(0, limit);
      const topIds = top.map((r) => r.id);

      const cc = await fetchCommentCounts("tip", topIds);
      return top.map((r) =>
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
      const mapped = rows
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((r) => ({
          tag: {
            id: r.tag_id,
            name: r.name,
            category: r.category,
          } satisfies Tag,
          count: r.count,
        }));
      return {
        tech: mapped.filter((r) => r.tag.category === "tech").slice(0, 8),
        context: mapped.filter((r) => r.tag.category === "context").slice(0, 8),
      };
    },
  });
}

