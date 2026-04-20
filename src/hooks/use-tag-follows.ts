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
 * Hooks for "tag follow" — issue #12 (phase 1).
 *
 * The follow relation is private to the follower (migration 00025 RLS).
 * `useMyTagFollows` is therefore keyed by the *viewer*'s userId, not by
 * the target tag, and there is no public "followed-by-N-users" hook.
 *
 * `useTipsFollowedByTags` is a deliberate shape twin of
 * `useTipsMapped` in use-domain-queries.ts — same select, same
 * mapper — but narrowed by `id in (…tipIdsFromFollowedTags)`. Keeping
 * the two flows parallel lets the Index feed tab switch between them
 * without any other data-shape changes.
 */

/**
 * The set of tag_ids the current user follows. Returns a Set (not an
 * array) so membership checks for the FollowButton are O(1) and callers
 * don't have to .includes() every render.
 */
export function useMyTagFollows(userId: string | undefined) {
  return useQuery({
    queryKey: ["tag-follows", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("tag_follows")
        .select("tag_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.tag_id));
    },
  });
}

/**
 * Toggle the (userId, tagId) follow relation.
 *
 * Both paths are idempotent by design so concurrent clicks from
 * multiple tabs or from different surfaces (sidebar + search) can't
 * produce a spurious error:
 *
 *  - Follow is an upsert against the (user_id, tag_id) composite PK
 *    with `ignoreDuplicates: true`. A second parallel follow lands
 *    a no-op instead of failing the unique constraint.
 *  - Unfollow is a plain DELETE; deleting a row that isn't there is
 *    a Postgres no-op, not an error.
 *
 * The caller passes `isFollowed` (the state rendered on the button at
 * click time) so we don't do a read-before-write — that SELECT was the
 * racey half of the old implementation. The cache is still the source
 * of truth, so the callback and the invalidations stay the same.
 */
export function useToggleTagFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      tagId: string;
      isFollowed: boolean;
    }) => {
      const { userId, tagId, isFollowed } = params;

      if (isFollowed) {
        const { error } = await supabase
          .from("tag_follows")
          .delete()
          .eq("user_id", userId)
          .eq("tag_id", tagId);
        if (error) throw error;
        return { followed: false } as const;
      }

      const { error } = await supabase
        .from("tag_follows")
        .upsert(
          { user_id: userId, tag_id: tagId },
          { onConflict: "user_id,tag_id", ignoreDuplicates: true },
        );
      if (error) throw error;
      return { followed: true } as const;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["tag-follows", variables.userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tips", "domain", "followed", variables.userId],
      });
    },
  });
}

/**
 * Published tips that carry *any* tag the viewer follows, ordered by
 * recency. Empty array when the viewer follows nothing — callers render
 * an empty-state prompt in that case.
 *
 * Implementation note: one small SELECT for the viewer's followed
 * tag_ids (covered by the (user_id, tag_id) PK), then a *single* tips
 * query with `tip_tags!inner(tag_id)` that filters server-side via
 * `in ("tip_tags.tag_id", …)`. The inner join pushes the match into
 * PostgREST so we don't fan out to a separate `tip_tags` lookup and
 * don't risk the 1000-row default reply cap truncating the set of
 * candidate tip_ids. Tips with multiple matching followed tags appear
 * once each thanks to client-side dedup on `id`.
 */
export function useTipsFollowedByTags(userId: string | undefined) {
  return useQuery({
    queryKey: ["tips", "domain", "followed", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Tip[]> => {
      const { data: followRows, error: followErr } = await supabase
        .from("tag_follows")
        .select("tag_id")
        .eq("user_id", userId!);
      if (followErr) throw followErr;
      const tagIds = (followRows ?? []).map((r) => r.tag_id);
      if (tagIds.length === 0) return [];

      const { data, error } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags!inner(tag:tags(*))`,
        )
        .eq("status", "published")
        .in("tip_tags.tag_id", tagIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rawRows = (data ?? []) as TipWithJoins[];
      // A tip that carries two followed tags would otherwise show up
      // twice. Keep the first (already in recency order) per id.
      const seen = new Set<string>();
      const rows: TipWithJoins[] = [];
      for (const r of rawRows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        rows.push(r);
      }
      const ids = rows.map((r) => r.id);
      const [rx, cc] = await Promise.all([
        fetchReactionSummaries("tip", ids),
        fetchCommentCounts("tip", ids),
      ]);
      return rows.map((r) =>
        mapTipRow(r, rx[r.id] ?? emptyReactionSummary(), cc[r.id] ?? 0),
      );
    },
  });
}
