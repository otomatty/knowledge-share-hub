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

describe("useAcknowledgeResurfacing", () => {
  it("only writes acknowledged_at and invalidates the self-resurfacings cache", async () => {
    const builder = chainable({ data: null, error: null });
    supabase.from.mockImplementationOnce(() => builder as unknown as ChainableBuilder);

    const { useAcknowledgeResurfacing } = await import("./use-tip-resurfacings");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAcknowledgeResurfacing(), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ id: "rs-1" });
    });

    // The BEFORE trigger on tip_resurfacings (migration 00022) rejects
    // any update to columns other than acknowledged_at, so the payload
    // must be exactly that single field.
    expect(builder.update).toHaveBeenCalledTimes(1);
    const payload = builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["acknowledged_at"]);
    expect(typeof payload.acknowledged_at).toBe("string");
    expect(builder.eq).toHaveBeenCalledWith("id", "rs-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tip-resurfacings", "self"],
    });
  });
});

describe("useAddTipAddendum", () => {
  it("inserts the trimmed content and invalidates the addendums cache", async () => {
    const builder = chainable({ data: null, error: null });
    supabase.from.mockImplementationOnce(() => builder as unknown as ChainableBuilder);

    const { useAddTipAddendum } = await import("./use-tip-resurfacings");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddTipAddendum(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        tipId: "tip-1",
        authorId: "user-1",
        content: "  あとから気づいたこと  ",
      });
    });

    expect(builder.insert).toHaveBeenCalledWith({
      tip_id: "tip-1",
      author_id: "user-1",
      content: "あとから気づいたこと",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tip-addendums", "tip-1"],
    });
  });

  it("no-ops on whitespace-only content (no insert, no error)", async () => {
    const { useAddTipAddendum } = await import("./use-tip-resurfacings");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useAddTipAddendum(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        tipId: "tip-1",
        authorId: "user-1",
        content: "   \n  ",
      });
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects content over the 140-char ceiling before hitting Supabase", async () => {
    const { useAddTipAddendum, TIP_ADDENDUM_MAX_LENGTH } = await import(
      "./use-tip-resurfacings"
    );
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useAddTipAddendum(), { wrapper });
    const tooLong = "あ".repeat(TIP_ADDENDUM_MAX_LENGTH + 1);
    await expect(
      result.current.mutateAsync({
        tipId: "tip-1",
        authorId: "user-1",
        content: tooLong,
      }),
    ).rejects.toThrow(/140文字以内/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("propagates the supabase insert error", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "rls denied" } }),
    );
    const { useAddTipAddendum } = await import("./use-tip-resurfacings");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useAddTipAddendum(), { wrapper });
    await expect(
      result.current.mutateAsync({
        tipId: "tip-1",
        authorId: "user-1",
        content: "ok",
      }),
    ).rejects.toMatchObject({ message: "rls denied" });
  });
});
