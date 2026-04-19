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
// Pagination knobs for the feed-resurfacing scan. We page through the
// 7–60-day window in batches and keep going until we either have
// `limit` high-engagement matches or hit `FEED_RESURFACING_MAX_SCAN` —
// whichever comes first. A fixed candidate cap (the old 3×limit/12 rule)
// left the section silently empty whenever the newest few tips in the
// window happened to be low-engagement even though qualifying older
// tips existed further back, which is exactly the scenario flagged in
// PR #27 round 5 review.
const FEED_RESURFACING_PAGE_SIZE = 50;
const FEED_RESURFACING_MAX_SCAN = 300;

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

      const matches: Tip[] = [];
      let offset = 0;
      while (
        matches.length < limit &&
        offset < FEED_RESURFACING_MAX_SCAN
      ) {
        let q = supabase
          .from("tips")
          .select(
            `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
          )
          .eq("status", "published")
          .lt("created_at", sevenDaysAgo)
          .gt("created_at", sixtyDaysAgo)
          .order("created_at", { ascending: false })
          .range(offset, offset + FEED_RESURFACING_PAGE_SIZE - 1);
        if (excludeUserId) {
          q = q.neq("author_id", excludeUserId);
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as TipWithJoins[];
        if (rows.length === 0) break;

        const ids = rows.map((r) => r.id);
        const [rx, cc] = await Promise.all([
          fetchReactionSummaries("tip", ids),
          fetchCommentCounts("tip", ids),
        ]);

        for (const r of rows) {
          const tip = mapTipRow(
            r,
            rx[r.id] ?? emptyReactionSummary(),
            cc[r.id] ?? 0,
          );
          const total =
            tip.reactions.same_thought +
            tip.reactions.new_view +
            tip.reactions.try_it +
            tip.reactions.learned;
          if (total >= minReactions) {
            matches.push(tip);
            if (matches.length >= limit) break;
          }
        }

        // The page was smaller than requested — the window is exhausted
        // and paging further would just repeat the same empty response.
        if (rows.length < FEED_RESURFACING_PAGE_SIZE) break;
        offset += FEED_RESURFACING_PAGE_SIZE;
      }
      return matches;
    },
  });
}

export const TIP_ADDENDUM_MAX_LENGTH = 140;

export interface TipAddendum {
  id: string;
  tipId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

/**
 * Addendums for a given tip, ordered oldest-first so the detail page can
 * render them as a chronological thread of re-reads under the original.
 */
export function useTipAddendums(tipId: string | undefined) {
  return useQuery({
    queryKey: ["tip-addendums", tipId],
    enabled: !!tipId,
    queryFn: async (): Promise<TipAddendum[]> => {
      const { data, error } = await supabase
        .from("tip_addendums")
        .select("id, tip_id, author_id, content, created_at")
        .eq("tip_id", tipId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        tipId: r.tip_id,
        authorId: r.author_id,
        content: r.content,
        createdAt: r.created_at,
      }));
    },
  });
}

/**
 * Append a re-read reflection as its own `tip_addendums` row (PR #27
 * review follow-up). Previously we concatenated into `tips.content`,
 * which collides with the 140-char CHECK on that column and opens a
 * read-modify-write race against concurrent edits. A dedicated row
 * avoids both: the original tip is untouched, the write is a pure
 * INSERT, and each addendum inherits its own 140-char ceiling from the
 * table constraint.
 *
 * The INSERT RLS policy pins `author_id` against `tips.author_id` so
 * even a forged client payload can't append to another user's tip.
 */
export function useAddTipAddendum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tipId: string;
      authorId: string;
      content: string;
    }) => {
      const trimmed = params.content.trim();
      if (!trimmed) return;
      if (trimmed.length > TIP_ADDENDUM_MAX_LENGTH) {
        // Soft-validate client-side so the UI can surface a clear
        // message; the DB CHECK catches the same case if anyone skips
        // the hook (tests, direct supabase calls, …).
        throw new Error(
          `追記は${TIP_ADDENDUM_MAX_LENGTH}文字以内にしてください`,
        );
      }
      const { error } = await supabase.from("tip_addendums").insert({
        tip_id: params.tipId,
        author_id: params.authorId,
        content: trimmed,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["tip-addendums", variables.tipId],
      });
    },
  });
}
