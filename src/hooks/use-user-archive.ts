import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
} from "@/lib/reaction-aggregates";
import { fetchAllPages } from "@/lib/supabase-pagination";
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
 *
 * Every read paginates with `.range()` via the shared `fetchAllPages`
 * helper, with an `id` tie-breaker appended to the ORDER BY. A
 * timestamp alone is not a total order: two rows sharing a
 * `created_at` / `pledged_at` can reorder between page requests and
 * produce duplicates or gaps at boundaries (PR #28 coderabbit).
 * `attemptsByResult` has no natural chronological sort and only feeds
 * a lookup Map, so it orders by `id` alone — the goal there is
 * page-boundary stability, not presentation order.
 */

export function useUserArchive(userId: string | undefined) {
  return useQuery({
    queryKey: ["archive", "user", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ArchiveEntry[]> => {
      const tipRows = await fetchAllPages<TipWithJoins>((from, to) =>
        supabase
          .from("tips")
          .select(
            `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
          )
          .eq("author_id", userId!)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      );
      if (tipRows.length === 0) return [];

      const tipIds = tipRows.map((r) => r.id);

      // Both attempt fetches are scoped to tipIds so the query stays
      // bounded as the user's archive grows. Self-attempts are blocked
      // at the DB layer (migration 00010), which is why
      // `attemptsBySource` drops the `user_id = me` filter — the useful
      // rows are attempts by OTHER users targeting the owner's source
      // tips, not the owner's own attempts on those same tips (that set
      // is provably empty).
      const [rx, cc, addendumRows, attemptsBySourceRows, attemptsByResultRows] =
        await Promise.all([
          fetchReactionSummaries("tip", tipIds),
          fetchCommentCounts("tip", tipIds),
          fetchAllPages<{
            id: string;
            tip_id: string;
            author_id: string;
            content: string;
            created_at: string;
          }>((from, to) =>
            supabase
              .from("tip_addendums")
              .select("id, tip_id, author_id, content, created_at")
              .in("tip_id", tipIds)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          ),
          fetchAllPages<{
            source_tip_id: string;
            result_tip_id: string | null;
            pledged_at: string;
          }>((from, to) =>
            supabase
              .from("tip_attempts_public")
              .select("id, source_tip_id, result_tip_id, pledged_at")
              .in("source_tip_id", tipIds)
              .order("pledged_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          ),
          fetchAllPages<{
            source_tip_id: string;
            result_tip_id: string | null;
          }>((from, to) =>
            supabase
              .from("tip_attempts_public")
              .select("id, source_tip_id, result_tip_id")
              .in("result_tip_id", tipIds)
              .order("id", { ascending: true })
              .range(from, to),
          ),
        ]);

      const addendumsByTip = new Map<string, TipAddendum[]>();
      for (const row of addendumRows) {
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

      // `resultTipIds` — every result tip other users posted in
      // response to this source tip. Keep them all; collapsing to one
      // would silently drop attempts from the backup whenever multiple
      // people tried the same tip. The attempts query is ordered
      // ascending by `pledged_at` so list order is chronological.
      const resultsBySource = new Map<string, string[]>();
      for (const row of attemptsBySourceRows) {
        if (!row.result_tip_id) continue;
        const src = row.source_tip_id;
        const list = resultsBySource.get(src);
        if (list) list.push(row.result_tip_id);
        else resultsBySource.set(src, [row.result_tip_id]);
      }
      // `sourceTipId` — this tip is a result; link back to its source
      const sourceByMyResult = new Map<string, string>();
      for (const row of attemptsByResultRows) {
        if (row.result_tip_id) {
          sourceByMyResult.set(row.result_tip_id, row.source_tip_id);
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
        resultTipIds: resultsBySource.get(row.id),
      }));
    },
  });
}
