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

  it("rotates by getDate() % length", () => {
    const date = new Date(2026, 3, 17);
    expect(getDailyPrompt(date)).toBe(
      INSIGHT_PROMPTS[date.getDate() % INSIGHT_PROMPTS.length],
    );
  });
});
