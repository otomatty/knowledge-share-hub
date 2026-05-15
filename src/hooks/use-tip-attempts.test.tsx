import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  chainable,
  createSupabaseMock,
  resetSupabaseMock,
  type ChainableBuilder,
} from "@/test/supabase-mock";
import { createQueryWrapper } from "@/test/test-wrapper";

const mockSupabase = vi.hoisted(() => ({
  client: undefined as ReturnType<typeof createSupabaseMock> | undefined,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabase.client,
}));

mockSupabase.client = createSupabaseMock();
const supabase = mockSupabase.client!;

beforeEach(() => {
  resetSupabaseMock(supabase);
});

describe("useLinkTipAttemptResult", () => {
  it("upserts on (source_tip_id, user_id) and invalidates source/mine/result caches", async () => {
    const builder = chainable({ data: null, error: null });
    supabase.from.mockImplementationOnce(() => builder as unknown as ChainableBuilder);

    const { useLinkTipAttemptResult } = await import("./use-tip-attempts");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useLinkTipAttemptResult(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        sourceTipId: "tip-source",
        userId: "user-1",
        resultTipId: "tip-result",
      });
    });

    expect(supabase.from).toHaveBeenCalledWith("tip_attempts");
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        source_tip_id: "tip-source",
        user_id: "user-1",
        result_tip_id: "tip-result",
      },
      // Conflict target lets a try_it click and a result post collapse
      // into a single attempt row instead of two.
      { onConflict: "source_tip_id,user_id" },
    );

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["tip-attempts", "source", "tip-source"]);
    expect(keys).toContainEqual([
      "tip-attempts",
      "mine",
      "tip-source",
      "user-1",
    ]);
    expect(keys).toContainEqual(["tip-attempts", "result", "tip-result"]);
  });

  it("propagates the upsert error", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "fk violation" } }),
    );
    const { useLinkTipAttemptResult } = await import("./use-tip-attempts");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useLinkTipAttemptResult(), { wrapper });
    await expect(
      result.current.mutateAsync({
        sourceTipId: "tip-source",
        userId: "user-1",
        resultTipId: "tip-result",
      }),
    ).rejects.toMatchObject({ message: "fk violation" });
  });
});
