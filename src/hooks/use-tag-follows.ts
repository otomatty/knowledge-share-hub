import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyReactionSummary,
  fetchCommentCounts,
  fetchReactionSummaries,
} from "@/lib/reaction-aggregates";
import { mapTipRow, type TipWithJoins } from "@/lib/supabase-mappers";
import { fetchAllPagesChunked } from "@/lib/supabase-pagination";
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
 * Implementation is a two-step fetch, intentionally *not* a single
 * `tip_tags!inner(...)` embed. PostgREST applies embedding filters to
 * the embedded resource itself, so a `.in("tip_tags.tag_id", tagIds)`
 * narrows the returned `tip_tags` array to only the followed tags —
 * which would strip any non-followed tags off the tip payload and
 * leave ContentCard rendering an incomplete tag chip row. Step 1
 * finds matching tip_ids; step 2 re-fetches those tips with the same
 * normal left-join shape `useTipsMapped` uses, preserving the full
 * tag set per tip.
 *
 *   1. `tag_follows` → the viewer's followed tag_ids (tiny; PK-covered).
 *   2. `tip_tags WHERE tag_id IN (…)` → candidate tip_ids. Paginated
 *      via `fetchAllPagesChunked` because a user following popular
 *      tags can blow past the 1000-row PostgREST default; chunking
 *      also keeps the `.in(tag_id, …)` URL under reverse-proxy limits.
 *   3. `tips WHERE id IN (…)` with the standard embed. Chunked for
 *      the same URL-length reason on tipIds; published+recency filter
 *      and final ordering are applied per chunk, then we sort the
 *      merged result (chunks complete in parallel so cross-chunk
 *      order isn't guaranteed by the server).
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

      // Step 2: paginate+chunk tip_tags to get candidate tip_ids.
      const tipTagRows = await fetchAllPagesChunked<{ tip_id: string }>(
        tagIds,
        (chunk, from, to) =>
          supabase
            .from("tip_tags")
            .select("tip_id")
            .in("tag_id", chunk)
            .order("tip_id", { ascending: true })
            .range(from, to),
      );
      const tipIds = Array.from(new Set(tipTagRows.map((r) => r.tip_id)));
      if (tipIds.length === 0) return [];

      // Step 3: fetch full tip payloads (with *all* tags, not just the
      // followed subset). Chunk on tipIds to stay under URL length caps.
      const rows = await fetchAllPagesChunked<TipWithJoins>(
        tipIds,
        (chunk, from, to) =>
          supabase
            .from("tips")
            .select(
              `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
            )
            .eq("status", "published")
            .in("id", chunk)
            // Stable total order inside each chunk — `created_at` ties
            // are broken by `id` so pagination never overlaps/skips.
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to),
      );
      // Chunks resolve in parallel, so merged output isn't globally
      // sorted — re-sort for recency. Same tie-break as the builder.
      rows.sort((a, b) => {
        const d = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return d !== 0 ? d : a.id.localeCompare(b.id);
      });

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
