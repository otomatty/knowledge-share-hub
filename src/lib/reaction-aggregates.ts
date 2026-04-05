import { supabase } from "@/lib/supabase";
import type { ReactionSummary } from "@/types";

const emptySummary = (): ReactionSummary => ({
  helped: 0,
  clear: 0,
  learned: 0,
  nice: 0,
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

/** Reactions received on content authored by each user (tips, articles, memos). */
export async function fetchReactionCountsReceivedByAuthors(): Promise<
  { user_id: string; total: number }[]
> {
  const [{ data: tips, error: e1 }, { data: arts, error: e2 }, { data: memos, error: e3 }, { data: rx, error: e4 }] =
    await Promise.all([
      supabase.from("tips").select("id, author_id"),
      supabase.from("articles").select("id, author_id"),
      supabase.from("memos").select("id, author_id"),
      supabase.from("reactions").select("content_type, content_id"),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const tipAuthor = new Map((tips ?? []).map((t) => [t.id as string, t.author_id as string]));
  const artAuthor = new Map((arts ?? []).map((a) => [a.id as string, a.author_id as string]));
  const memoAuthor = new Map((memos ?? []).map((m) => [m.id as string, m.author_id as string]));

  const counts = new Map<string, number>();
  for (const r of rx ?? []) {
    const ct = r.content_type as string;
    const cid = r.content_id as string;
    let author: string | undefined;
    if (ct === "tip") author = tipAuthor.get(cid);
    else if (ct === "article") author = artAuthor.get(cid);
    else if (ct === "memo") author = memoAuthor.get(cid);
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
  const artTags = await supabase.from("article_tags").select("tag_id");
  const memoTags = await supabase.from("memo_tags").select("tag_id");
  if (tipTags.error) throw tipTags.error;
  if (artTags.error) throw artTags.error;
  if (memoTags.error) throw memoTags.error;

  const countMap = new Map<string, number>();
  const add = (tagId: string) =>
    countMap.set(tagId, (countMap.get(tagId) ?? 0) + 1);
  for (const r of tipTags.data ?? []) add(r.tag_id as string);
  for (const r of artTags.data ?? []) add(r.tag_id as string);
  for (const r of memoTags.data ?? []) add(r.tag_id as string);

  return tags.map((t) => ({
    tag_id: t.id as string,
    name: t.name as string,
    count: countMap.get(t.id as string) ?? 0,
  }));
}

export async function fetchCommentCounts(
  contentType: "article" | "memo",
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
