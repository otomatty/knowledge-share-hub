import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { emptyReactionSummary } from "@/lib/reaction-aggregates";
import type { Database } from "@/integrations/supabase/types";
import type { ReactionSummary, ReactionType } from "@/types";

type Tables = Database["knowledge_share_hub"]["Tables"];

export function useTips() {
  return useQuery({
    queryKey: ["tips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tips")
        .select(
          `*, author:profiles!tips_author_id_fkey(*), tip_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useComments(
  contentType: Tables["comments"]["Row"]["content_type"],
  contentId: string,
) {
  return useQuery({
    queryKey: ["comments", contentType, contentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select(`*, author:profiles!comments_author_id_fkey(*)`)
        .eq("content_type", contentType)
        .eq("content_id", contentId)
        .is("parent_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!contentId,
  });
}

export function useReactionCounts(
  contentType: Tables["reactions"]["Row"]["content_type"],
  contentId: string,
) {
  return useQuery({
    queryKey: ["reactions", contentType, contentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reactions")
        .select("reaction_type")
        .eq("content_type", contentType)
        .eq("content_id", contentId);
      if (error) throw error;

      const counts = emptyReactionSummary();
      for (const row of data) {
        const rt = row.reaction_type as keyof typeof counts;
        counts[rt]++;
      }
      return counts;
    },
    enabled: !!contentId,
  });
}

type ToggleReactionVariables = {
  userId: string;
  contentType: Tables["reactions"]["Row"]["content_type"];
  contentId: string;
  reactionType: Tables["reactions"]["Row"]["reaction_type"];
};

type ToggleReactionContext = {
  reactionsKey: readonly unknown[];
  userReactionsKey: readonly unknown[];
  prevReactions: ReactionSummary | undefined;
  prevUserReactions: Set<ReactionType> | undefined;
};

export function useToggleReaction() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ToggleReactionVariables, ToggleReactionContext>({
    mutationFn: async ({
      userId,
      contentType,
      contentId,
      reactionType,
    }) => {
      const { data: existing } = await supabase
        .from("reactions")
        .select("id")
        .eq("user_id", userId)
        .eq("content_type", contentType)
        .eq("content_id", contentId)
        .eq("reaction_type", reactionType)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reactions").insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          reaction_type: reactionType,
        });
        if (error) throw error;
      }
    },
    // Issue #40 / PR #57 follow-up: optimistic update + rollback. The
    // reaction toggle was already narrowed to a single tip's caches,
    // but the UI still had to wait for the server round-trip before
    // the count/button state moved. Patch the two per-content caches
    // — ["reactions", ...] (count summary) and ["user-reactions", ...]
    // (set of reaction types the user has) — based on whether the
    // reaction is already in the user's set. On error, restore both
    // snapshots; on settled, invalidate to reconcile with the server.
    onMutate: async (variables) => {
      const reactionsKey = [
        "reactions",
        variables.contentType,
        variables.contentId,
      ] as const;
      const userReactionsKey = [
        "user-reactions",
        variables.userId,
        variables.contentType,
        variables.contentId,
      ] as const;

      await Promise.all([
        queryClient.cancelQueries({ queryKey: reactionsKey }),
        queryClient.cancelQueries({ queryKey: userReactionsKey }),
      ]);

      const prevReactions =
        queryClient.getQueryData<ReactionSummary>(reactionsKey);
      const prevUserReactions =
        queryClient.getQueryData<Set<ReactionType>>(userReactionsKey);

      // Gate the directional update on knowing the user's prior reaction
      // state. Without prevUserReactions we can't tell add from remove,
      // so an early-tap (before useUserReactionTypesOnContent resolves)
      // would optimistically +1 a count that the server is about to -1,
      // causing a visible 3→4→2 flicker (Codex review on PR #57).
      if (prevUserReactions !== undefined) {
        const hadReaction = prevUserReactions.has(
          variables.reactionType as ReactionType,
        );
        const next = new Set(prevUserReactions);
        if (hadReaction) next.delete(variables.reactionType as ReactionType);
        else next.add(variables.reactionType as ReactionType);
        queryClient.setQueryData<Set<ReactionType>>(userReactionsKey, next);

        if (prevReactions !== undefined) {
          const rt = variables.reactionType as keyof ReactionSummary;
          const delta = hadReaction ? -1 : 1;
          queryClient.setQueryData<ReactionSummary>(reactionsKey, {
            ...prevReactions,
            [rt]: Math.max(0, prevReactions[rt] + delta),
          });
        }
      }

      return {
        reactionsKey,
        userReactionsKey,
        prevReactions,
        prevUserReactions,
      };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;
      if (context.prevReactions !== undefined) {
        queryClient.setQueryData(context.reactionsKey, context.prevReactions);
      }
      if (context.prevUserReactions !== undefined) {
        queryClient.setQueryData(
          context.userReactionsKey,
          context.prevUserReactions,
        );
      }
    },
    // Invalidate on settled (success OR error). A network failure after
    // the server already wrote would otherwise leave the cache stuck on
    // the rolled-back snapshot until the next natural refetch
    // (CodeRabbit PR #57).
    onSettled: (_data, _err, variables) => {
      if (!variables) return;
      queryClient.invalidateQueries({
        queryKey: ["reactions", variables.contentType, variables.contentId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "user-reactions",
          variables.userId,
          variables.contentType,
          variables.contentId,
        ],
      });
      // Issue #40: narrow the tip-domain invalidation to the affected
      // tip only. The previous blanket `["tips", "domain"]` invalidate
      // refetched every feed (`useTipsMapped`, `useTipsByUser`,
      // `useRecentTopTips`, `useTipsFollowedByTags`) on every reaction
      // tap — a multi-hundred-row query storm on a fast tapper. Now
      // only `useTipByIdMapped` (which keys on tipId) re-runs; feeds
      // and the sidebar ranking pick up the new count on their next
      // natural refetch (focus / 5-min staleTime). Acceptable
      // trade-off: list counts can briefly trail until the next
      // refresh, but they are still authoritative on hard reload.
      if (variables.contentType === "tip") {
        queryClient.invalidateQueries({
          queryKey: ["tips", "domain", variables.contentId],
        });
      }
      // A try_it reaction on a tip creates (or leaves untouched) a
      // tip_attempts row via the DB trigger `handle_try_it_reaction`.
      // The TipDetail "post result" CTA and "tried-by" list both read
      // from the tip-attempts caches, so invalidate them here to keep
      // the reaction toggle and the lineage UI in sync on the same click.
      if (
        variables.reactionType === "try_it" &&
        variables.contentType === "tip"
      ) {
        queryClient.invalidateQueries({
          queryKey: ["tip-attempts", "source", variables.contentId],
        });
        queryClient.invalidateQueries({
          queryKey: [
            "tip-attempts",
            "mine",
            variables.contentId,
            variables.userId,
          ],
        });
      }
    },
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      comment: Tables["comments"]["Insert"],
    ) => {
      const { data, error } = await supabase
        .from("comments")
        .insert(comment)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["comments", "thread", data.content_type, data.content_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tips", "domain", data.content_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tips", "domain"],
      });
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useNotifications(userId: string) {
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select(`*, actor:profiles!notifications_actor_id_fkey(*)`)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });
}
