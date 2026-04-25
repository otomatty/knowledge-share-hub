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
 * Anonymous tips are filtered out unconditionally — the public profile
 * is the only caller and it must not deanonymise. Owner-side surfaces
 * that need the full set (drafts + anonymous tips) use `useUserArchive`
 * instead. (Note: this hook only filters at the application layer.
 * `tips` RLS still exposes `author_id` on anonymous rows to any
 * authenticated user via direct PostgREST queries; closing that gap
 * needs a schema-level change and is out of scope for this PR.)
 */
export function useTipsByUser(userId: string | undefined) {
  return useQuery({
    queryKey: ["tips", "domain", "by-user", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Tip[]> => {
      const { data, error } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .eq("author_id", userId!)
        .eq("is_anonymous", false)
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

      // `published_at` is set unconditionally by both write paths
      // (TipNew.tsx, TipsDialog.tsx) when a tip is published, so the
      // `.gte` filter doesn't lose any row in practice. The column is
      // still typed `string | null` because the schema doesn't enforce
      // NOT NULL via a CHECK; a published tip with NULL `published_at`
      // would silently drop out here, which is preferred over
      // surfacing it without a known publish time in a "this week"
      // ranking. If that invariant ever breaks, fix it at the schema
      // level rather than papering over it with `.or(is.null)`.
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

      // Pre-compute the score and timestamp once per row. The naive
      // version re-parsed `published_at` and re-summed reactions inside
      // the comparator, paying those costs O(N log N) times for what
      // are O(1) per-row values. Tie-breaks: reaction total desc,
      // publish time desc (already the row order, but be explicit),
      // then `id` for a stable total order — otherwise two tips with
      // identical scores would shuffle across refetches.
      const ranked = rows
        .map((r) => {
          const s = rx[r.id];
          return {
            row: r,
            score: s
              ? s.same_thought + s.new_view + s.try_it + s.learned
              : 0,
            time: new Date(r.published_at ?? r.created_at).getTime(),
          };
        })
        .sort((a, b) => {
          const d = b.score - a.score;
          if (d !== 0) return d;
          const t = b.time - a.time;
          if (t !== 0) return t;
          return b.row.id.localeCompare(a.row.id);
        })
        .map((x) => x.row);
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

