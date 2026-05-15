import { supabase } from "@/lib/supabase";
import { fetchAllPagesChunked } from "@/lib/supabase-pagination";
import type { ReactionSummary } from "@/types";

export const emptyReactionSummary = (): ReactionSummary => ({
  same_thought: 0,
  new_view: 0,
  try_it: 0,
  learned: 0,
});

export async function fetchReactionSummaries(
  contentType: "tip" | "comment",
  contentIds: string[],
): Promise<Record<string, ReactionSummary>> {
  const out: Record<string, ReactionSummary> = {};
  if (contentIds.length === 0) return out;

  // Page + chunk. A single un-paginated read truncates at the
  // PostgREST row cap, and a single `.in(contentIds)` for a very
  // large contentIds list blows past URL-length limits in the
  // reverse proxy. Order by `id` only — this is a pure aggregate, so
  // the order just needs to be stable across pages, not chronological.
  const rows = await fetchAllPagesChunked<{
    content_id: string;
    reaction_type: string;
  }>(contentIds, (chunk, from, to) =>
    supabase
      .from("reactions")
      .select("content_id, reaction_type")
      .eq("content_type", contentType)
      .in("content_id", chunk)
      .order("id", { ascending: true })
      .range(from, to),
  );

  for (const id of contentIds) {
    out[id] = emptyReactionSummary();
  }
  for (const row of rows) {
    const id = row.content_id;
    const rt = row.reaction_type as keyof ReactionSummary;
    if (out[id]) out[id][rt]++;
  }
  return out;
}

export async function fetchTagUsageCounts(): Promise<
  { tag_id: string; name: string; category: "tech" | "context"; count: number }[]
> {
  const { data: tags, error: te } = await supabase
    .from("tags")
    .select("id, name, category");
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
    category: t.category as "tech" | "context",
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

  const rows = await fetchAllPagesChunked<{ content_id: string }>(
    contentIds,
    (chunk, from, to) =>
      supabase
        .from("comments")
        .select("content_id")
        .eq("content_type", contentType)
        .in("content_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
  );
  for (const row of rows) {
    const cid = row.content_id;
    out[cid] = (out[cid] ?? 0) + 1;
  }
  return out;
}
