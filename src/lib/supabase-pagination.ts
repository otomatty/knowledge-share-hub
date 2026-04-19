import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Page through a PostgREST `.range()` query until exhaustion.
 *
 * PostgREST defaults to a 1000-row cap on `SELECT` responses and
 * hosted Supabase projects often tighten it further. Any unbounded
 * read in a context that needs completeness (archive exports, full
 * aggregates across a large tip set) will silently truncate beyond
 * the cap.
 *
 * Advancement is keyed off the actual returned row count, not the
 * fixed `PAGE_SIZE` we requested. When `max_rows` is configured below
 * `PAGE_SIZE` (e.g. 500), the server returns fewer rows than we asked
 * for on every request — if we advanced by `PAGE_SIZE` we'd skip
 * `PAGE_SIZE - rows.length` rows between pages, and if we exited on
 * `rows.length < PAGE_SIZE` we'd quit at the first request. The
 * empty-response exit condition is the only reliable signal across
 * both "we hit the cap" and "we reached the end of the data" cases
 * (PR #28 codex).
 *
 * Callers MUST pass a query with a stable total ordering (timestamp +
 * `id` tie-breaker at minimum). If ordering isn't stable, pages can
 * overlap or skip rows on boundaries where the sort key ties.
 */

export const PAGE_SIZE = 1000;

// Ceiling on total rows. A misbehaving endpoint that keeps returning
// non-empty pages forever would otherwise loop indefinitely. Sized in
// rows (not iterations) so a low `max_rows` config can't silently
// shrink the effective ceiling — at `max_rows=1000` this allows
// 1M rows; at `max_rows=100` this allows the same 1M, just via
// 10× more requests.
const MAX_ROWS = 1_000_000;

export async function fetchAllPages<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await build(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return all;
    all.push(...rows);
    offset += rows.length;
    if (all.length >= MAX_ROWS) {
      throw new Error(
        `pagination exceeded ${MAX_ROWS} rows — refusing to page further`,
      );
    }
  }
}

/**
 * Default chunk size for `.in(ids)` queries. PostgREST encodes the
 * list inline in the request URL, and common reverse-proxy limits
 * (nginx / Kong default to 8KB for the request line) kick in around
 * 150-200 UUIDs. 100 gives ~5KB of IN-list bytes with comfortable
 * headroom for the rest of the URL.
 */
export const DEFAULT_IN_CHUNK_SIZE = 100;

/**
 * Page through a query whose filter uses `.in(column, ids)` where
 * `ids` can be arbitrarily large. Splits `ids` into bounded chunks so
 * the generated URL stays under reverse-proxy limits (PR #28 codex),
 * runs each chunk in parallel, then concatenates.
 *
 * Each chunk is independently paginated via `fetchAllPages`, so the
 * per-chunk row ceiling and ordering contract carry through. Callers
 * still MUST provide a stable total-order (timestamp + `id`
 * tie-breaker) inside the builder. Chunks run in parallel — order of
 * the combined output is "chunk-0 rows, then chunk-1 rows, …" which
 * preserves per-chunk order but not cross-chunk chronology; callers
 * that need strict global order should sort the result themselves.
 */
export async function fetchAllPagesChunked<T>(
  ids: string[],
  build: (
    chunkIds: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  opts: { chunkSize?: number } = {},
): Promise<T[]> {
  const chunkSize = opts.chunkSize ?? DEFAULT_IN_CHUNK_SIZE;
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      fetchAllPages<T>((from, to) => build(chunk, from, to)),
    ),
  );
  return results.flat();
}
