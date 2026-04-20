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
 * Toggle the (userId, tagId) follow relation. Read-then-branch so the
 * UI can call the same mutation from both "follow" and "unfollow"
 * buttons without maintaining a current-state prop on the caller.
 *
 * Invalidates both the follow list and the "followed-tags feed" so the
 * Index.tsx tab reflects the change immediately after the user toggles
 * from the sidebar or search page.
 */
export function useToggleTagFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { userId: string; tagId: string }) => {
      const { userId, tagId } = params;
      const { data: existing, error: selErr } = await supabase
        .from("tag_follows")
        .select("tag_id")
        .eq("user_id", userId)
        .eq("tag_id", tagId)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing) {
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
        .insert({ user_id: userId, tag_id: tagId });
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
 * Implementation note: we fetch followed tag_ids first (small read,
 * covered by the (user_id, tag_id) PK), then the matching tip_ids from
 * `tip_tags`, then run the same tip-select shape `useTipsMapped` uses.
 * The tip read is the one that dominates; it stays a single query with
 * a server-side `in (…)` to avoid N+1.
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

      const { data: tipTagRows, error: tipTagErr } = await supabase
        .from("tip_tags")
        .select("tip_id")
        .in("tag_id", tagIds);
      if (tipTagErr) throw tipTagErr;
      const tipIds = Array.from(
        new Set((tipTagRows ?? []).map((r) => r.tip_id)),
      );
      if (tipIds.length === 0) return [];

      const { data, error } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .in("id", tipIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as TipWithJoins[];
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
