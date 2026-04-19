import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Page through a PostgREST `.range()` query until exhaustion.
 *
 * PostgREST defaults to a 1000-row cap on `SELECT` responses and
 * hosted Supabase projects often tighten it further — any unbounded
 * read in a context that needs completeness (archive exports, full
 * aggregates across a large tip set) will silently truncate beyond
 * the cap.
 *
 * Callers MUST pass a query with a stable total ordering (timestamp +
 * `id` tie-breaker at minimum). If ordering isn't stable, pages can
 * overlap or skip rows on boundaries where the sort key ties. See PR
 * #28 coderabbit follow-up.
 */

export const PAGE_SIZE = 1000;

// Ceiling on iterations — a misbehaving endpoint that keeps returning
// full pages forever would otherwise loop indefinitely. A million rows
// is well past the "you should be using a DB dump, not a JSON export"
// threshold; stop there and surface an explicit error.
const MAX_PAGES = 1000;

export async function fetchAllPages<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await build(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
    offset += PAGE_SIZE;
  }
  throw new Error(
    `pagination exceeded ${MAX_PAGES * PAGE_SIZE} rows — refusing to page further`,
  );
}
