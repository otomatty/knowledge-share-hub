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

describe("useToggleReaction", () => {
  it("inserts a reaction when none exists", async () => {
    // First .from() — read the existing reaction (maybeSingle returns null).
    // Second .from() — insert the new row.
    const lookup = chainable<{ id: string } | null>({ data: null, error: null });
    const insertBuilder = chainable({ data: null, error: null });
    supabase.from
      .mockImplementationOnce(() => lookup as unknown as ChainableBuilder)
      .mockImplementationOnce(() => insertBuilder as unknown as ChainableBuilder);

    const { useToggleReaction } = await import("./use-supabase-query");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        contentType: "tip",
        contentId: "tip-1",
        reactionType: "same_thought",
      });
    });

    // Lookup chain was used.
    expect(lookup.select).toHaveBeenCalledWith("id");
    expect(lookup.maybeSingle).toHaveBeenCalled();
    // Insert chain received the right payload.
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      content_type: "tip",
      content_id: "tip-1",
      reaction_type: "same_thought",
    });
    // Issue #40: only the specific tip's domain cache is invalidated
    // (not the whole feed) when a reaction toggles.
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["reactions", "tip", "tip-1"]);
    expect(keys).toContainEqual([
      "user-reactions",
      "user-1",
      "tip",
      "tip-1",
    ]);
    expect(keys).toContainEqual(["tips", "domain", "tip-1"]);
    expect(keys).not.toContainEqual(["tips", "domain"]);
  });

  it("deletes the reaction when one already exists", async () => {
    const lookup = chainable<{ id: string }>({
      data: { id: "rx-1" },
      error: null,
    });
    const deleteBuilder = chainable({ data: null, error: null });
    supabase.from
      .mockImplementationOnce(() => lookup as unknown as ChainableBuilder)
      .mockImplementationOnce(() => deleteBuilder as unknown as ChainableBuilder);

    const { useToggleReaction } = await import("./use-supabase-query");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        contentType: "tip",
        contentId: "tip-1",
        reactionType: "same_thought",
      });
    });

    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("id", "rx-1");
  });

  it("invalidates tip-attempts caches when a try_it reaction is toggled", async () => {
    supabase.from
      .mockImplementationOnce(() => chainable({ data: null, error: null }))
      .mockImplementationOnce(() => chainable({ data: null, error: null }));

    const { useToggleReaction } = await import("./use-supabase-query");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        contentType: "tip",
        contentId: "tip-1",
        reactionType: "try_it",
      });
    });

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["tip-attempts", "source", "tip-1"]);
    expect(keys).toContainEqual(["tip-attempts", "mine", "tip-1", "user-1"]);
  });

  it("does NOT invalidate tip-domain cache for comment reactions", async () => {
    supabase.from
      .mockImplementationOnce(() => chainable({ data: null, error: null }))
      .mockImplementationOnce(() => chainable({ data: null, error: null }));

    const { useToggleReaction } = await import("./use-supabase-query");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        contentType: "comment",
        contentId: "c-1",
        reactionType: "same_thought",
      });
    });

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).not.toContainEqual(["tips", "domain"]);
    expect(keys).not.toContainEqual(["tips", "domain", "c-1"]);
  });

  it("throws when the insert errors out", async () => {
    supabase.from
      .mockImplementationOnce(() => chainable({ data: null, error: null }))
      .mockImplementationOnce(() =>
        chainable({ data: null, error: { message: "fk violation" } }),
      );

    const { useToggleReaction } = await import("./use-supabase-query");
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await expect(
      result.current.mutateAsync({
        userId: "user-1",
        contentType: "tip",
        contentId: "tip-1",
        reactionType: "same_thought",
      }),
    ).rejects.toMatchObject({ message: "fk violation" });
  });

  // Issue #40 acceptance criterion: optimistic update reflected in
  // the UI immediately, rolled back on failure.
  it("optimistically increments the cached count on add", async () => {
    supabase.from
      .mockImplementationOnce(() => chainable({ data: null, error: null }))
      .mockImplementationOnce(() => chainable({ data: null, error: null }));

    const { useToggleReaction } = await import("./use-supabase-query");
    const { wrapper, queryClient } = createQueryWrapper();
    queryClient.setQueryData(["reactions", "tip", "tip-1"], {
      same_thought: 2,
      new_view: 0,
      try_it: 0,
      learned: 0,
    });
    queryClient.setQueryData(
      ["user-reactions", "user-1", "tip", "tip-1"],
      new Set<string>(),
    );

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        userId: "user-1",
        contentType: "tip",
        contentId: "tip-1",
        reactionType: "same_thought",
      });
    });

    expect(queryClient.getQueryData(["reactions", "tip", "tip-1"])).toEqual({
      same_thought: 3,
      new_view: 0,
      try_it: 0,
      learned: 0,
    });
    expect(
      (queryClient.getQueryData(["user-reactions", "user-1", "tip", "tip-1"]) as Set<string>)
        .has("same_thought"),
    ).toBe(true);
  });

  it("rolls back the optimistic update when the mutation fails", async () => {
    supabase.from
      .mockImplementationOnce(() => chainable({ data: null, error: null }))
      .mockImplementationOnce(() =>
        chainable({ data: null, error: { message: "rls denied" } }),
      );

    const { useToggleReaction } = await import("./use-supabase-query");
    const { wrapper, queryClient } = createQueryWrapper();
    const initialCounts = {
      same_thought: 5,
      new_view: 0,
      try_it: 0,
      learned: 0,
    };
    const initialUserSet = new Set<string>();
    queryClient.setQueryData(["reactions", "tip", "tip-1"], initialCounts);
    queryClient.setQueryData(
      ["user-reactions", "user-1", "tip", "tip-1"],
      initialUserSet,
    );

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          userId: "user-1",
          contentType: "tip",
          contentId: "tip-1",
          reactionType: "same_thought",
        }),
      ).rejects.toMatchObject({ message: "rls denied" });
    });

    expect(queryClient.getQueryData(["reactions", "tip", "tip-1"])).toEqual(
      initialCounts,
    );
    expect(
      (queryClient.getQueryData(["user-reactions", "user-1", "tip", "tip-1"]) as Set<string>)
        .has("same_thought"),
    ).toBe(false);
  });
});

describe("useCreateComment", () => {
  it("inserts the comment and invalidates the thread + tip-domain caches", async () => {
    const inserted = {
      id: "c-1",
      content_type: "tip",
      content_id: "tip-1",
      author_id: "user-1",
      content: "good",
      parent_id: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    };
    const builder = chainable<typeof inserted>({
      data: inserted,
      error: null,
    });
    supabase.from.mockImplementationOnce(() => builder as unknown as ChainableBuilder);

    const { useCreateComment } = await import("./use-supabase-query");
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateComment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        content_type: "tip",
        content_id: "tip-1",
        author_id: "user-1",
        content: "good",
      });
    });

    expect(builder.insert).toHaveBeenCalledWith({
      content_type: "tip",
      content_id: "tip-1",
      author_id: "user-1",
      content: "good",
    });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["comments", "thread", "tip", "tip-1"]);
    expect(keys).toContainEqual(["tips", "domain", "tip-1"]);
    expect(keys).toContainEqual(["tips", "domain"]);
  });

  it("propagates the supabase error", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "rls denied" } }),
    );
    const { useCreateComment } = await import("./use-supabase-query");
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateComment(), { wrapper });
    await expect(
      result.current.mutateAsync({
        content_type: "tip",
        content_id: "tip-1",
        author_id: "user-1",
        content: "no",
      }),
    ).rejects.toMatchObject({ message: "rls denied" });
  });
});

describe("useMarkAllNotificationsRead", () => {
  it("updates is_read=true for unread rows of the user", async () => {
    const builder = chainable({ data: null, error: null });
    supabase.from.mockImplementationOnce(() => builder as unknown as ChainableBuilder);

    const { useMarkAllNotificationsRead } = await import(
      "./use-supabase-query"
    );
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync("user-1");
    });

    expect(builder.update).toHaveBeenCalledWith({ is_read: true });
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("is_read", false);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["notifications", "user-1"],
    });
  });

  it("rejects when the update errors out", async () => {
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "boom" } }),
    );
    const { useMarkAllNotificationsRead } = await import(
      "./use-supabase-query"
    );
    const { wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper,
    });
    await expect(result.current.mutateAsync("user-1")).rejects.toMatchObject({
      message: "boom",
    });
  });
});

