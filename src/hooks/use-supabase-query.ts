import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { emptyReactionSummary } from "@/lib/reaction-aggregates";
import type { Database } from "@/integrations/supabase/types";

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

export function useComments(contentType: string, contentId: string) {
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

export function useReactionCounts(contentType: string, contentId: string) {
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

export function useToggleReaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      contentType,
      contentId,
      reactionType,
    }: {
      userId: string;
      contentType: string;
      contentId: string;
      reactionType: Tables["reactions"]["Row"]["reaction_type"];
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
    onSuccess: (_, variables) => {
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
