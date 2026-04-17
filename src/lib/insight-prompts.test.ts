import { describe, it, expect } from "vitest";
import { INSIGHT_PROMPTS, getDailyPrompt } from "./insight-prompts";

describe("insight-prompts", () => {
  it("exposes at least 10 prompts", () => {
    expect(INSIGHT_PROMPTS.length).toBeGreaterThanOrEqual(10);
  });

  it("returns a prompt from the list", () => {
    expect(INSIGHT_PROMPTS).toContain(getDailyPrompt(new Date(2026, 3, 17)));
  });

  it("is deterministic for the same day", () => {
    const a = getDailyPrompt(new Date(2026, 3, 17, 9, 0, 0));
    const b = getDailyPrompt(new Date(2026, 3, 17, 23, 59, 59));
    expect(a).toBe(b);
  });

  it("rotates by one step per calendar day", () => {
    const a = getDailyPrompt(new Date(2026, 3, 17));
    const b = getDailyPrompt(new Date(2026, 3, 18));
    const idxA = INSIGHT_PROMPTS.indexOf(a);
    const idxB = INSIGHT_PROMPTS.indexOf(b);
    expect(idxB).toBe((idxA + 1) % INSIGHT_PROMPTS.length);
  });

  it("does not collide at month boundaries", () => {
    // A naive `date.getDate() % length` would map Jan 31 and Feb 1 to the
    // same index whenever 31 % length === 1 % length.
    const jan31 = getDailyPrompt(new Date(2026, 0, 31));
    const feb1 = getDailyPrompt(new Date(2026, 1, 1));
    expect(jan31).not.toBe(feb1);
  });

  it("does not collide across DST spring-forward", () => {
    // Europe/London springs forward on 2025-03-30; a local-midnight formula
    // (`localMidnight.getTime() / 86_400_000`) buckets Mar 30 and Mar 31
    // together because consecutive local midnights are only 23h apart.
    const mar30 = getDailyPrompt(new Date(2025, 2, 30));
    const mar31 = getDailyPrompt(new Date(2025, 2, 31));
    expect(mar30).not.toBe(mar31);
  });
});
