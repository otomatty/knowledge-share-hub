import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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

export function useArticles() {
  return useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select(
          `*, author:profiles!articles_author_id_fkey(*), article_tags(tag:tags(*))`,
        )
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useArticle(id: string) {
  return useQuery({
    queryKey: ["articles", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select(
          `*, author:profiles!articles_author_id_fkey(*), article_tags(tag:tags(*))`,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useMemos() {
  return useQuery({
    queryKey: ["memos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memos")
        .select(
          `*, author:profiles!memos_author_id_fkey(*), memo_tags(tag:tags(*)), memo_entries(*)`,
        )
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useMemo(id: string) {
  return useQuery({
    queryKey: ["memos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memos")
        .select(
          `*, author:profiles!memos_author_id_fkey(*), memo_tags(tag:tags(*)), memo_entries(*)`,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useBooks() {
  return useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select(
          `*, author:profiles!books_author_id_fkey(*), book_chapters(*, article:articles(*))`,
        )
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: ["books", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select(
          `*, author:profiles!books_author_id_fkey(*), book_chapters(*, article:articles(*, author:profiles!articles_author_id_fkey(*)))`,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
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

      const counts = { helped: 0, clear: 0, learned: 0, nice: 0 };
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
        queryKey: ["articles", "domain", data.content_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["memos", "domain", data.content_id],
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
