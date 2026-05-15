import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

describe("useDailyPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a non-empty string for today's prompt", async () => {
    const { useDailyPrompt } = await import("./use-daily-prompt");
    const { result } = renderHook(() => useDailyPrompt());
    expect(typeof result.current).toBe("string");
    expect(result.current.length).toBeGreaterThan(0);
  });

  it("flips the prompt when the calendar day changes", async () => {
    // Pin start time to a midnight boundary so a +24h jump definitely
    // crosses into the next day's prompt index.
    vi.setSystemTime(new Date("2026-05-15T00:30:00Z"));
    const { useDailyPrompt } = await import("./use-daily-prompt");
    const { result } = renderHook(() => useDailyPrompt());
    const day1 = result.current;

    // Jump 24h forward and let the 1-minute interval fire once.
    vi.setSystemTime(new Date("2026-05-16T00:30:00Z"));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).not.toBe(day1);
  });

  it("clears the interval on unmount (no leaked timers)", async () => {
    const clearSpy = vi.spyOn(window, "clearInterval");
    const { useDailyPrompt } = await import("./use-daily-prompt");
    const { unmount } = renderHook(() => useDailyPrompt());
    unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
