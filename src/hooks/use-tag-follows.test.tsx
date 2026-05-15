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

describe("useToggleTagFollow", () => {
  it("upserts the (user, tag) row when not currently followed", async () => {
    const builder = chainable({ data: null, error: null });
    supabase.from.mockImplementationOnce(() => builder as unknown as ChainableBuilder);

    const { useToggleTagFollow } = await import("./use-tag-follows");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useToggleTagFollow(), { wrapper });
    const out = await act(() =>
      result.current.mutateAsync({
        userId: "user-1",
        tagId: "tag-1",
        isFollowed: false,
      }),
    );

    expect(out).toEqual({ followed: true });
    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", tag_id: "tag-1" },
      // ignoreDuplicates avoids racing concurrent follow clicks against
      // the (user_id, tag_id) composite PK.
      { onConflict: "user_id,tag_id", ignoreDuplicates: true },
    );

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["tag-follows", "user-1"]);
    expect(keys).toContainEqual(["tips", "domain", "followed", "user-1"]);
  });

  it("deletes the row when currently followed", async () => {
    const builder = chainable({ data: null, error: null });
    supabase.from.mockImplementationOnce(() => builder as unknown as ChainableBuilder);

    const { useToggleTagFollow } = await import("./use-tag-follows");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useToggleTagFollow(), { wrapper });
    const out = await act(() =>
      result.current.mutateAsync({
        userId: "user-1",
        tagId: "tag-1",
        isFollowed: true,
      }),
    );

    expect(out).toEqual({ followed: false });
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("tag_id", "tag-1");
  });

  it("propagates the upsert error", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "rls denied" } }),
    );
    const { useToggleTagFollow } = await import("./use-tag-follows");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useToggleTagFollow(), { wrapper });
    await expect(
      result.current.mutateAsync({
        userId: "user-1",
        tagId: "tag-1",
        isFollowed: false,
      }),
    ).rejects.toMatchObject({ message: "rls denied" });
  });
});

describe("useMyTagFollows", () => {
  it("returns a Set of followed tag ids", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({
        data: [{ tag_id: "tag-1" }, { tag_id: "tag-2" }],
        error: null,
      }),
    );

    const { useMyTagFollows } = await import("./use-tag-follows");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useMyTagFollows("user-1"), { wrapper });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBeInstanceOf(Set);
    expect(Array.from(result.current.data!)).toEqual(["tag-1", "tag-2"]);
  });

  it("is disabled when userId is undefined (no fetch)", async () => {
    const { useMyTagFollows } = await import("./use-tag-follows");
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useMyTagFollows(undefined), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
