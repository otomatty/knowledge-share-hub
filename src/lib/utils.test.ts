import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("concatenates a list of class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "", "b")).toBe("a b");
  });

  it("flattens nested arrays and objects (clsx semantics)", () => {
    expect(cn(["a", { b: true, c: false }, "d"])).toBe("a b d");
  });

  it("merges conflicting Tailwind utilities, keeping the last one", () => {
    // tailwind-merge collapses conflicting padding scales — without it
    // both classes would render and Tailwind's `px-4` would lose to
    // `px-2` only by source order, not predictably.
    expect(cn("px-4", "px-2")).toBe("px-2");
    expect(cn("text-sm font-bold", "text-lg")).toBe("font-bold text-lg");
  });

  it("returns '' for no arguments", () => {
    expect(cn()).toBe("");
  });
});
