import { describe, it, expect } from "vitest";
import { sortTagsByCategory } from "./tag-utils";
import type { Tag } from "@/types";

const tag = (id: string, category: Tag["category"]): Tag => ({
  id,
  name: id,
  category,
});

describe("sortTagsByCategory", () => {
  it("places context tags before tech tags", () => {
    const input: Tag[] = [
      tag("react", "tech"),
      tag("ハマった", "context"),
      tag("typescript", "tech"),
      tag("学び", "context"),
    ];
    const out = sortTagsByCategory(input);
    expect(out.map((t) => t.category)).toEqual([
      "context",
      "context",
      "tech",
      "tech",
    ]);
  });

  it("preserves the relative order within the same category (stable)", () => {
    const input: Tag[] = [
      tag("a", "tech"),
      tag("b", "context"),
      tag("c", "tech"),
      tag("d", "context"),
    ];
    const out = sortTagsByCategory(input);
    expect(out.map((t) => t.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("does not mutate the input array", () => {
    const input: Tag[] = [tag("react", "tech"), tag("学び", "context")];
    const snapshot = [...input];
    sortTagsByCategory(input);
    expect(input).toEqual(snapshot);
  });

  it("returns [] for an empty input", () => {
    expect(sortTagsByCategory([])).toEqual([]);
  });

  it("is idempotent", () => {
    const input: Tag[] = [
      tag("react", "tech"),
      tag("ハマった", "context"),
      tag("ts", "tech"),
    ];
    const once = sortTagsByCategory(input);
    const twice = sortTagsByCategory(once);
    expect(twice).toEqual(once);
  });
});
