import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
} from "@/lib/reaction-aggregates";
import { mapTipRow, type TipWithJoins } from "@/lib/supabase-mappers";
import type { ArchiveEntry } from "@/lib/archive-export";
import type { TipAddendum } from "@/hooks/use-tip-resurfacings";

/**
 * Owner-scoped fetch for the personal archive (issue #11).
 *
 * Unlike `useTipsMapped`, this intentionally includes drafts alongside
 * published tips so the export is a complete backup of the user's
 * knowledge — Twitter's trade-off is precisely that drafts live inside
 * the platform; we don't want to mirror that here. RLS on `tips` already
 * restricts non-published reads to the author, so filtering by
 * `author_id` is sufficient.
 *
 * Addendums (issue #10 re-reads) and the source/result linkage from the
 * try-it loop (issue #8) are pulled alongside so one archive export
 * contains the whole timeline of an insight, not just the original post.
 */
export function useUserArchive(userId: string | undefined) {
  return useQuery({
    queryKey: ["archive", "user", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ArchiveEntry[]> => {
      const { data: tipsData, error: tipsErr } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("author_id", userId!)
        .order("created_at", { ascending: false });
      if (tipsErr) throw tipsErr;
      const tipRows = (tipsData ?? []) as TipWithJoins[];
      if (tipRows.length === 0) return [];

      const tipIds = tipRows.map((r) => r.id);

      // Three parallel aggregate fetches. The tip_attempts_public view
      // un-masks `user_id` for the owner of the row, so `.eq("user_id", userId)`
      // matches every attempt this user made (for resultTipId lookup) —
      // and the WHERE result_tip_id clause covers the anonymous-result
      // case for sourceTipId lookup.
      const [rx, cc, addendumsResp, attemptsAsOwnerResp, attemptsByResultResp] =
        await Promise.all([
          fetchReactionSummaries("tip", tipIds),
          fetchCommentCounts("tip", tipIds),
          supabase
            .from("tip_addendums")
            .select("id, tip_id, author_id, content, created_at")
            .in("tip_id", tipIds)
            .order("created_at", { ascending: true }),
          supabase
            .from("tip_attempts_public")
            .select("source_tip_id, result_tip_id, user_id")
            .eq("user_id", userId!),
          supabase
            .from("tip_attempts_public")
            .select("source_tip_id, result_tip_id")
            .in("result_tip_id", tipIds),
        ]);
      if (addendumsResp.error) throw addendumsResp.error;
      if (attemptsAsOwnerResp.error) throw attemptsAsOwnerResp.error;
      if (attemptsByResultResp.error) throw attemptsByResultResp.error;

      const addendumsByTip = new Map<string, TipAddendum[]>();
      for (const row of addendumsResp.data ?? []) {
        const list = addendumsByTip.get(row.tip_id) ?? [];
        list.push({
          id: row.id,
          tipId: row.tip_id,
          authorId: row.author_id,
          content: row.content,
          createdAt: row.created_at,
        });
        addendumsByTip.set(row.tip_id, list);
      }

      // `resultTipId` — this source-tip produced a result tip by the owner
      const resultByMySource = new Map<string, string>();
      for (const row of attemptsAsOwnerResp.data ?? []) {
        if (row.result_tip_id) {
          resultByMySource.set(
            row.source_tip_id as string,
            row.result_tip_id as string,
          );
        }
      }
      // `sourceTipId` — this tip is a result; link back to its source
      const sourceByMyResult = new Map<string, string>();
      for (const row of attemptsByResultResp.data ?? []) {
        if (row.result_tip_id) {
          sourceByMyResult.set(
            row.result_tip_id as string,
            row.source_tip_id as string,
          );
        }
      }

      return tipRows.map((row) => ({
        tip: mapTipRow(
          row,
          rx[row.id] ?? emptyReactionSummary(),
          cc[row.id] ?? 0,
        ),
        addendums: addendumsByTip.get(row.id) ?? [],
        sourceTipId: sourceByMyResult.get(row.id),
        resultTipId: resultByMySource.get(row.id),
      }));
    },
  });
}
