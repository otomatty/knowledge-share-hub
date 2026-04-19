import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
} from "@/lib/reaction-aggregates";
import { mapTipRow, type TipWithJoins } from "@/lib/supabase-mappers";
import type { Tip } from "@/types";

/**
 * Hooks for issue #10 — "気づきの熟成" (tip resurfacing).
 *
 * Two flavours of resurfacing live here:
 *
 *  1. **Self re-reads** (`useSelfResurfacings`): rows from the
 *     `tip_resurfacings` table that the cron dispatcher inserted for the
 *     current user, prompting them to re-read their own 1-week-old tip.
 *     Marked "done" via `useAcknowledgeResurfacing` when the user picks an
 *     action (追記 / 育った気づき投稿 / 閉じる).
 *
 *  2. **Feed resurfacing** (`useFeedResurfacings`): other users' older
 *     tips that still have ≥ the reaction threshold. Computed live each
 *     time the feed loads — no cron/DB state — so the pool is fresh and
 *     dismissals don't need a separate table.
 */

export interface SelfResurfacing {
  id: string;
  intervalDays: number;
  surfacedAt: string;
  acknowledgedAt: string | null;
  tip: Tip;
}

/**
 * Pending (not yet acknowledged) self re-read prompts for `userId`.
 *
 * RLS confines the query to the caller's own rows, so we rely on that
 * rather than duplicating the `user_id` filter. Joined tip rows bring the
 * full `Tip` domain shape (tags, reactions, comment count) so the banner
 * UI can reuse ContentCard-style presentation.
 */
export function useSelfResurfacings(userId: string | undefined) {
  return useQuery({
    queryKey: ["tip-resurfacings", "self", userId],
    enabled: !!userId,
    queryFn: async (): Promise<SelfResurfacing[]> => {
      const { data, error } = await supabase
        .from("tip_resurfacings")
        .select(
          `id, interval_days, surfaced_at, acknowledged_at,
            tip:tips!tip_resurfacings_tip_id_fkey(
              *,
              author:profiles!tips_author_id_fkey(*),
              tip_tags(tag:tags(*))
            )`,
        )
        .is("acknowledged_at", null)
        .order("surfaced_at", { ascending: false })
        .limit(5);
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        interval_days: number;
        surfaced_at: string;
        acknowledged_at: string | null;
        tip: TipWithJoins | null;
      }>;
      // Tips are cascade-deleted, but keep a defensive filter — a
      // row that lost its tip reference has nothing to render.
      const withTip = rows.filter(
        (r): r is typeof r & { tip: TipWithJoins } => r.tip != null,
      );
      const tipIds = withTip.map((r) => r.tip.id);
      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", tipIds),
        fetchCommentCounts("tip", tipIds),
      ]);
      return withTip.map((r) => ({
        id: r.id,
        intervalDays: r.interval_days,
        surfacedAt: r.surfaced_at,
        acknowledgedAt: r.acknowledged_at,
        tip: mapTipRow(
          r.tip,
          rx[r.tip.id] ?? emptyReactionSummary(),
          cc[r.tip.id] ?? 0,
        ),
      }));
    },
  });
}

/**
 * Mark a resurfacing prompt as acknowledged. A BEFORE trigger on the
 * table rejects writes to any column other than `acknowledged_at`
 * (migration 00022), so we only touch that.
 */
export function useAcknowledgeResurfacing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string }) => {
      const { error } = await supabase
        .from("tip_resurfacings")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tip-resurfacings", "self"],
      });
    },
  });
}

/**
 * Selection for the "今読み直したい1件" section of the main feed.
 *
 * Rules:
 *  - tip is published and between 7 and 60 days old
 *  - tip is not authored by `excludeUserId` (usually the viewer)
 *  - tip has at least `minReactions` total reactions
 *  - return `limit` rows ordered newest-first inside the window, so the
 *    pool refreshes as older tips age out naturally
 *
 * This stays a live query by design — no cron/DB state means the pool is
 * always fresh, a dismiss-by-reload UX is free, and we don't need a
 * per-user dedupe table on day one. If "seen" tracking becomes important
 * later, promote this into `tip_resurfacings` with `kind='feed'`.
 */
export function useFeedResurfacings(
  excludeUserId: string | undefined,
  opts: { limit?: number; minReactions?: number } = {},
) {
  const { limit = 3, minReactions = 2 } = opts;
  return useQuery({
    queryKey: ["tip-resurfacings", "feed", excludeUserId, limit, minReactions],
    queryFn: async (): Promise<Tip[]> => {
      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const sixtyDaysAgo = new Date(
        now - 60 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Pull a slightly larger candidate set (3× target) so we can drop
      // any that fall below the reaction threshold after the JS-side
      // aggregate check. Keeps the DB query cheap — PostgREST can't join
      // to a count aggregate here without a dedicated view.
      const candidateLimit = Math.max(limit * 3, 12);

      let q = supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .lt("created_at", sevenDaysAgo)
        .gt("created_at", sixtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(candidateLimit);
      if (excludeUserId) {
        q = q.neq("author_id", excludeUserId);
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as TipWithJoins[];
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", ids),
        fetchCommentCounts("tip", ids),
      ]);

      const mapped = rows
        .map((r) =>
          mapTipRow(r, rx[r.id] ?? emptyReactionSummary(), cc[r.id] ?? 0),
        )
        .filter((t) => {
          const total =
            t.reactions.same_thought +
            t.reactions.new_view +
            t.reactions.try_it +
            t.reactions.learned;
          return total >= minReactions;
        })
        .slice(0, limit);
      return mapped;
    },
  });
}

/**
 * Append an "追記" block to the end of an existing tip. Used by the
 * self-resurfacing banner when a user picks "追記する" — the new thought
 * gets concatenated after a dated divider so the original and the later
 * reflection stay visually linked on the tip's detail page.
 *
 * Only the tip's author can update their own row (existing RLS policy
 * on `tips`), so no extra permission check is needed here.
 */
export function useAppendToTip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tipId: string;
      currentContent: string;
      addendum: string;
    }) => {
      const trimmed = params.addendum.trim();
      if (!trimmed) return;
      const today = new Date().toISOString().slice(0, 10);
      const next = `${params.currentContent}\n\n---\n**[${today} 再読み追記]** ${trimmed}`;
      const { error } = await supabase
        .from("tips")
        .update({ content: next })
        .eq("id", params.tipId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tips"] });
      queryClient.invalidateQueries({
        queryKey: ["tips", "domain", variables.tipId],
      });
    },
  });
}
