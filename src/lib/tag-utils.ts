import type { Tag } from "@/types";

/**
 * Stable sort that puts context tags before tech tags.
 * Returns a new array; does not mutate the input.
 */
export function sortTagsByCategory(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => {
    if (a.category === b.category) return 0;
    return a.category === "context" ? -1 : 1;
  });
}
