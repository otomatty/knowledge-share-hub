import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { profileToUser } from "@/lib/profile-mapper";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
} from "@/lib/reaction-aggregates";
import { mapTipRow, type TipWithJoins } from "@/lib/supabase-mappers";
import type { TipAttempt, Tip, User } from "@/types";

/**
 * Hooks for the "try it → result" action loop (issue #8).
 *
 * The source of truth is the `tip_attempts` table:
 *   - A 🔁 `try_it` reaction creates a pledge row via a DB trigger.
 *   - Posting a "result tip" from /tips/new?source=<sourceId> upserts the
 *     same row and fills in `result_tip_id` / `completed_at`.
 * This file wraps that table in React Query hooks for the two surfaces
 * that consume it: TipDetail (lineage sections) and TipNew (upsert).
 */

export interface TipAttemptWithRefs {
  attempt: TipAttempt;
  user: User;
  resultTip: Tip | null;
}

/**
 * All attempts against a given source tip — used by TipDetail to render
 * "people who tried this" and "results from this tip".
 */
export function useTipAttemptsForSource(sourceTipId: string | undefined) {
  return useQuery({
    queryKey: ["tip-attempts", "source", sourceTipId],
    enabled: !!sourceTipId,
    queryFn: async (): Promise<TipAttemptWithRefs[]> => {
      const { data, error } = await supabase
        .from("tip_attempts")
        .select(
          `*,
            user:profiles!tip_attempts_user_id_fkey(*),
            result_tip:tips!tip_attempts_result_tip_id_fkey(
              *,
              author:profiles!tips_author_id_fkey(*),
              tip_tags(tag:tags(*))
            )`,
        )
        .eq("source_tip_id", sourceTipId!)
        .order("pledged_at", { ascending: false });
      if (error) throw error;

      type Row = TipAttempt & {
        user: Parameters<typeof profileToUser>[0];
        result_tip: (TipWithJoins & { author: Parameters<typeof profileToUser>[0] }) | null;
      };
      const rows = (data ?? []) as Row[];

      // Hydrate result tips with aggregated reactions + comment counts so they
      // can be rendered with ContentCard. (Skipped when a row has no result yet.)
      const resultIds = rows
        .map((r) => r.result_tip?.id)
        .filter((x): x is string => !!x);
      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", resultIds),
        fetchCommentCounts("tip", resultIds),
      ]);

      return rows.map((r) => ({
        attempt: {
          id: r.id,
          source_tip_id: r.source_tip_id,
          result_tip_id: r.result_tip_id,
          user_id: r.user_id,
          pledged_at: r.pledged_at,
          completed_at: r.completed_at,
          follow_up_notified_at: r.follow_up_notified_at,
        },
        user: profileToUser(r.user),
        resultTip: r.result_tip
          ? mapTipRow(
              r.result_tip,
              rx[r.result_tip.id] ?? emptyReactionSummary(),
              cc[r.result_tip.id] ?? 0,
            )
          : null,
      }));
    },
  });
}

/**
 * The current user's attempt on a given source tip, if any.
 *
 * Used by TipDetail to decide whether to show the "試した結果を投稿する" CTA:
 *  - attempt exists AND result_tip_id is null → show CTA
 *  - attempt with result_tip_id → already posted, show "投稿済み" state (or hide)
 *  - no attempt → show nothing (they haven't pledged)
 */
export function useMyAttemptForTip(
  sourceTipId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: ["tip-attempts", "mine", sourceTipId, userId],
    enabled: !!sourceTipId && !!userId,
    queryFn: async (): Promise<TipAttempt | null> => {
      const { data, error } = await supabase
        .from("tip_attempts")
        .select("*")
        .eq("source_tip_id", sourceTipId!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as TipAttempt | null) ?? null;
    },
  });
}

/**
 * Given a (potential) result tip, find the attempt row pointing at it.
 * Used by TipDetail to render the "派生元" backlink above the result tip's body.
 * Returns null (not an error) when the tip isn't linked to any source.
 */
export function useSourceAttemptForResult(resultTipId: string | undefined) {
  return useQuery({
    queryKey: ["tip-attempts", "result", resultTipId],
    enabled: !!resultTipId,
    queryFn: async (): Promise<{
      attempt: TipAttempt;
      sourceTip: Tip;
    } | null> => {
      const { data, error } = await supabase
        .from("tip_attempts")
        .select(
          `*,
            source_tip:tips!tip_attempts_source_tip_id_fkey(
              *,
              author:profiles!tips_author_id_fkey(*),
              tip_tags(tag:tags(*))
            )`,
        )
        .eq("result_tip_id", resultTipId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      type Row = TipAttempt & {
        source_tip:
          | (TipWithJoins & { author: Parameters<typeof profileToUser>[0] })
          | null;
      };
      const row = data as Row;
      if (!row.source_tip) return null;

      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", [row.source_tip.id]),
        fetchCommentCounts("tip", [row.source_tip.id]),
      ]);

      return {
        attempt: {
          id: row.id,
          source_tip_id: row.source_tip_id,
          result_tip_id: row.result_tip_id,
          user_id: row.user_id,
          pledged_at: row.pledged_at,
          completed_at: row.completed_at,
          follow_up_notified_at: row.follow_up_notified_at,
        },
        sourceTip: mapTipRow(
          row.source_tip,
          rx[row.source_tip.id] ?? emptyReactionSummary(),
          cc[row.source_tip.id] ?? 0,
        ),
      };
    },
  });
}

/**
 * Upsert-and-link: called from TipNew after a result tip has been posted.
 * Uses INSERT ... ON CONFLICT DO UPDATE so the flow also works when the
 * user skipped the 🔁 reaction and went straight from a source-tip CTA
 * to posting a result — no prior attempt row exists in that case.
 */
export function useLinkTipAttemptResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      sourceTipId: string;
      userId: string;
      resultTipId: string;
    }) => {
      const { sourceTipId, userId, resultTipId } = params;
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("tip_attempts")
        .upsert(
          {
            source_tip_id: sourceTipId,
            user_id: userId,
            result_tip_id: resultTipId,
            completed_at: now,
          },
          { onConflict: "source_tip_id,user_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["tip-attempts", "source", variables.sourceTipId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "tip-attempts",
          "mine",
          variables.sourceTipId,
          variables.userId,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["tip-attempts", "result", variables.resultTipId],
      });
    },
  });
}
