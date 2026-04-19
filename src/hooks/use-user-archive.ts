import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
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
 *
 * Every read paginates with `.range()` until the page returns fewer
 * than `PAGE` rows. PostgREST defaults to a 1000-row hard cap on
 * `SELECT` responses and hosted Supabase projects often tighten it
 * further, so a single unbounded request would silently truncate the
 * archive once a power user crosses the cap — a data-loss bug for a
 * feature positioned as a full personal backup (PR #28 codex).
 */

const PAGE = 1000;

async function fetchAllPages<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // Upper bound on iterations: a misbehaving endpoint that keeps
  // returning PAGE rows forever would loop without this. 1M archive
  // rows is well past the "your backup format should be a database
  // dump, not JSON" threshold — stop there and surface an explicit
  // error so the UI doesn't silently hang.
  const MAX_PAGES = 1000;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await build(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
    offset += PAGE;
  }
  throw new Error(
    `archive fetch exceeded ${MAX_PAGES * PAGE} rows — refusing to page further`,
  );
}

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
              .range(from, to),
          ),
          fetchAllPages<{
            source_tip_id: string;
            result_tip_id: string | null;
            pledged_at: string;
          }>((from, to) =>
            supabase
              .from("tip_attempts_public")
              .select("source_tip_id, result_tip_id, pledged_at")
              .in("source_tip_id", tipIds)
              .order("pledged_at", { ascending: true })
              .range(from, to),
          ),
          fetchAllPages<{
            source_tip_id: string;
            result_tip_id: string | null;
          }>((from, to) =>
            supabase
              .from("tip_attempts_public")
              .select("source_tip_id, result_tip_id")
              .in("result_tip_id", tipIds)
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
