import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { profileToUser } from "@/lib/profile-mapper";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
} from "@/lib/reaction-aggregates";
import { mapTipRow, type TipWithJoins } from "@/lib/supabase-mappers";
import type { Database } from "@/integrations/supabase/types";
import type { TipAttempt, Tip, User } from "@/types";

type ProfileRow = Database["knowledge_share_hub"]["Tables"]["profiles"]["Row"];

/**
 * Hooks for the "try it → result" action loop (issue #8).
 *
 * Reads go through the `tip_attempts_public` view (migration 00019),
 * which masks `user_id` to `NULL` when the viewer is not the owner and
 * the linked result tip is anonymous. The raw `tip_attempts` table has
 * SELECT revoked from `authenticated`/`anon`, so the mask can't be
 * side-stepped. Writes still go to the table directly — INSERT/UPDATE
 * grants are untouched and the upsert doesn't chain RETURNING.
 *
 * Because the view exposes the same column names as the table, the
 * partial unique / FK invariants still apply; we just can't rely on
 * PostgREST's FK-embed syntax through the view, so the hooks hydrate
 * profiles and result tips via separate batched queries.
 */

// Placeholder user returned when the view masked user_id. The UI already
// renders anonymous results as "名無しエンジニア" via `resultTip.is_anonymous`;
// this keeps the `user` field in `TipAttemptWithRefs` non-null so
// callers don't need to branch on it for basic display.
const ANONYMOUS_USER: User = {
  id: "",
  email: "",
  username: "",
  display_name: "名無しエンジニア",
  skill_tags: [],
  created_at: new Date(0).toISOString(),
};

type AttemptRow = {
  id: string;
  source_tip_id: string;
  result_tip_id: string | null;
  user_id: string | null;
  pledged_at: string;
  completed_at: string | null;
  follow_up_notified_at: string | null;
};

function toTipAttempt(row: AttemptRow): TipAttempt {
  return {
    id: row.id,
    source_tip_id: row.source_tip_id,
    result_tip_id: row.result_tip_id,
    // `user_id` is never null in the underlying table; a null here
    // means the view masked it because the result is anonymous and the
    // viewer isn't the owner. Surface empty-string so the type stays
    // `string` — callers should rely on `user.id === ""` or the linked
    // `resultTip.is_anonymous` flag rather than reading user_id.
    user_id: row.user_id ?? "",
    pledged_at: row.pledged_at,
    completed_at: row.completed_at,
    follow_up_notified_at: row.follow_up_notified_at,
  };
}

export interface TipAttemptWithRefs {
  attempt: TipAttempt;
  user: User;
  resultTip: Tip | null;
}

/** Default page size for the tried-by list on TipDetail. */
export const TIP_ATTEMPTS_PAGE_SIZE = 50;

/**
 * All attempts against a given source tip — used by TipDetail to render
 * "people who tried this" and "results from this tip".
 *
 * Paginated: returns at most `limit` rows starting at `offset`. The
 * default page size is deliberately generous (50) because the usual tip
 * will have a handful of attempts at most, but this caps worst-case
 * payload size (and the hydration fan-out for result tips) if a tip
 * goes viral.
 */
export function useTipAttemptsForSource(
  sourceTipId: string | undefined,
  {
    limit = TIP_ATTEMPTS_PAGE_SIZE,
    offset = 0,
  }: { limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: ["tip-attempts", "source", sourceTipId, limit, offset],
    enabled: !!sourceTipId,
    queryFn: async (): Promise<TipAttemptWithRefs[]> => {
      const { data, error } = await supabase
        .from("tip_attempts_public")
        .select("*")
        .eq("source_tip_id", sourceTipId!)
        .order("pledged_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      const rows = (data ?? []) as AttemptRow[];

      // Batch-fetch related profiles (skipping masked/null user_ids) and
      // result tips (with their own author+tags joins) so we can still
      // render the same information the old FK-embed query produced.
      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x)),
      );
      const resultIds = Array.from(
        new Set(
          rows.map((r) => r.result_tip_id).filter((x): x is string => !!x),
        ),
      );

      const [profilesResp, resultTipsResp, rx, cc] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("*").in("id", userIds)
          : Promise.resolve({ data: [] as ProfileRow[], error: null }),
        resultIds.length > 0
          ? supabase
              .from("tips")
              .select(
                `*,
                  author:profiles!tips_author_id_fkey(*),
                  tip_tags(tag:tags(*))`,
              )
              .in("id", resultIds)
          : Promise.resolve({ data: [] as TipWithJoins[], error: null }),
        fetchReactionSummaries("tip", resultIds),
        fetchCommentCounts("tip", resultIds),
      ]);
      if (profilesResp.error) throw profilesResp.error;
      if (resultTipsResp.error) throw resultTipsResp.error;

      const profileById = new Map<string, ProfileRow>(
        (profilesResp.data ?? []).map((p) => [p.id, p]),
      );
      const resultTipById = new Map<string, TipWithJoins>(
        ((resultTipsResp.data ?? []) as TipWithJoins[]).map((t) => [t.id, t]),
      );

      return rows.map((r) => {
        const profile = r.user_id ? profileById.get(r.user_id) : undefined;
        const resultTipRow = r.result_tip_id
          ? resultTipById.get(r.result_tip_id)
          : undefined;
        return {
          attempt: toTipAttempt(r),
          user: profile ? profileToUser(profile) : ANONYMOUS_USER,
          resultTip: resultTipRow
            ? mapTipRow(
                resultTipRow,
                rx[resultTipRow.id] ?? emptyReactionSummary(),
                cc[resultTipRow.id] ?? 0,
              )
            : null,
        };
      });
    },
  });
}

/**
 * The current user's attempt on a given source tip, if any.
 *
 * Used by TipDetail to decide whether to show the "試した結果を投稿する" CTA:
 *  - attempt exists AND result_tip_id is null AND completed_at is null → show CTA
 *  - attempt with result_tip_id / completed_at → already posted, hide CTA
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
      // The view un-masks user_id for the owner, so `.eq("user_id", userId)`
      // still matches.
      const { data, error } = await supabase
        .from("tip_attempts_public")
        .select("*")
        .eq("source_tip_id", sourceTipId!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toTipAttempt(data as AttemptRow) : null;
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
        .from("tip_attempts_public")
        .select("*")
        .eq("result_tip_id", resultTipId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const attemptRow = data as AttemptRow;

      // Fetch the source tip separately (PostgREST FK embeds don't flow
      // cleanly through the view; see module header).
      const { data: srcData, error: srcError } = await supabase
        .from("tips")
        .select(
          `*,
            author:profiles!tips_author_id_fkey(*),
            tip_tags(tag:tags(*))`,
        )
        .eq("id", attemptRow.source_tip_id)
        .maybeSingle();
      if (srcError) throw srcError;
      if (!srcData) return null;
      const sourceRow = srcData as TipWithJoins;

      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", [sourceRow.id]),
        fetchCommentCounts("tip", [sourceRow.id]),
      ]);

      return {
        attempt: toTipAttempt(attemptRow),
        sourceTip: mapTipRow(
          sourceRow,
          rx[sourceRow.id] ?? emptyReactionSummary(),
          cc[sourceRow.id] ?? 0,
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
 *
 * `completed_at` and the `try_it_result` notification to the source tip's
 * author are posted atomically by the `handle_tip_attempt_result` DB
 * trigger (migration 00009). The client stays oblivious to that side of
 * the loop. Writes still target the table directly (INSERT/UPDATE grants
 * remain in place even after 00019 revokes SELECT on it).
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
      const { error } = await supabase
        .from("tip_attempts")
        .upsert(
          {
            source_tip_id: sourceTipId,
            user_id: userId,
            result_tip_id: resultTipId,
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
