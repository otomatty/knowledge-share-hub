import { supabase } from "@/lib/supabase";
import type { ReactionSummary } from "@/types";

const emptySummary = (): ReactionSummary => ({
  same_thought: 0,
  new_view: 0,
  try_it: 0,
  learned: 0,
});

export async function fetchReactionSummaries(
  contentType: string,
  contentIds: string[],
): Promise<Record<string, ReactionSummary>> {
  const out: Record<string, ReactionSummary> = {};
  if (contentIds.length === 0) return out;

  const { data, error } = await supabase
    .from("reactions")
    .select("content_id, reaction_type")
    .eq("content_type", contentType)
    .in("content_id", contentIds);

  if (error) throw error;
  if (!data) return out;

  for (const id of contentIds) {
    out[id] = emptySummary();
  }
  for (const row of data) {
    const id = row.content_id as string;
    const rt = row.reaction_type as keyof ReactionSummary;
    if (out[id]) out[id][rt]++;
  }
  return out;
}

/** Reactions received on tips authored by each user. */
export async function fetchReactionCountsReceivedByAuthors(): Promise<
  { user_id: string; total: number }[]
> {
  const [{ data: tips, error: e1 }, { data: rx, error: e2 }] = await Promise.all([
    supabase.from("tips").select("id, author_id"),
    supabase
      .from("reactions")
      .select("content_id")
      .eq("content_type", "tip"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const tipAuthor = new Map(
    (tips ?? []).map((t) => [t.id as string, t.author_id as string]),
  );

  const counts = new Map<string, number>();
  for (const r of rx ?? []) {
    const author = tipAuthor.get(r.content_id as string);
    if (author) counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  return [...counts.entries()].map(([user_id, total]) => ({ user_id, total }));
}

export async function fetchTagUsageCounts(): Promise<
  { tag_id: string; name: string; count: number }[]
> {
  const { data: tags, error: te } = await supabase.from("tags").select("id, name");
  if (te) throw te;
  if (!tags?.length) return [];

  const tipTags = await supabase.from("tip_tags").select("tag_id");
  if (tipTags.error) throw tipTags.error;

  const countMap = new Map<string, number>();
  const add = (tagId: string) =>
    countMap.set(tagId, (countMap.get(tagId) ?? 0) + 1);
  for (const r of tipTags.data ?? []) add(r.tag_id as string);

  return tags.map((t) => ({
    tag_id: t.id as string,
    name: t.name as string,
    count: countMap.get(t.id as string) ?? 0,
  }));
}

export async function fetchCommentCounts(
  contentType: "tip",
  contentIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (contentIds.length === 0) return out;
  for (const id of contentIds) out[id] = 0;

  const { data, error } = await supabase
    .from("comments")
    .select("content_id")
    .eq("content_type", contentType)
    .in("content_id", contentIds);

  if (error) throw error;
  for (const row of data ?? []) {
    const cid = row.content_id as string;
    out[cid] = (out[cid] ?? 0) + 1;
  }
  return out;
}
