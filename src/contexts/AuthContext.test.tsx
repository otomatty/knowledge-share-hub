import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  chainable,
  createSupabaseMock,
  resetSupabaseMock,
} from "@/test/supabase-mock";
import type { ReactNode } from "react";

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

async function renderAuth({ settle = true } = {}) {
  const { AuthProvider, useAuth } = await import("./AuthContext");
  function Wrapper({ children }: { children: ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }
  const result = renderHook(() => useAuth(), { wrapper: Wrapper });
  // Drain the initial getSession Promise (and any chained profile fetch)
  // inside an act-aware waitFor so subsequent assertions don't trip the
  // "update was not wrapped in act" warning when state lands late.
  if (settle) {
    await waitFor(() => expect(result.result.current.loading).toBe(false));
  }
  return result;
}

describe("useAuth", () => {
  it("throws when used outside AuthProvider", async () => {
    const { useAuth } = await import("./AuthContext");
    // Suppress React's expected console.error for the throw.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useAuth())).toThrow(
        /useAuth must be used within an AuthProvider/,
      );
    } finally {
      // Restore even if the assertion fails, so a regression here doesn't
      // silently mute console.error for the rest of the suite.
      errSpy.mockRestore();
    }
  });
});

describe("AuthProvider — initial session restoration", () => {
  it("clears loading after getSession resolves with no session", async () => {
    const { result } = await renderAuth({ settle: false });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it("hydrates user, session, and profile when getSession returns a session", async () => {
    const session = {
      user: { id: "user-1", email: "tanaka@example.com" },
      access_token: "x",
    };
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session },
      error: null,
    });
    supabase.from.mockImplementationOnce(() =>
      chainable({
        data: {
          id: "user-1",
          email: "tanaka@example.com",
          username: "tanaka",
          display_name: "田中",
          avatar_url: null,
          current_project: null,
          bio: null,
          skill_tags: [],
          role: "user",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
        error: null,
      }),
    );

    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    expect(result.current.user?.id).toBe("user-1");
    expect(result.current.session).toBe(session);
    expect(result.current.profile?.username).toBe("tanaka");
    expect(supabase.from).toHaveBeenCalledWith("profiles");
  });

  it("still clears loading when the profile fetch fails (no infinite spinner)", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "user-1", email: "tanaka@example.com" },
          access_token: "x",
        },
      },
      error: null,
    });
    supabase.from.mockImplementationOnce(() =>
      chainable({ data: null, error: { message: "rls denied" } }),
    );

    const { result } = await renderAuth();
    // User still hydrated even though profile fetch returned an error;
    // setProfile(null) keeps callers from rendering stale data.
    expect(result.current.user?.id).toBe("user-1");
    expect(result.current.profile).toBeNull();
  });
});

describe("AuthProvider — auth methods", () => {
  it("signInWithMagicLink delegates to signInWithOtp with a redirect URL", async () => {
    const { result } = await renderAuth();

    const { error } = await act(() =>
      result.current.signInWithMagicLink("tanaka@example.com"),
    );
    expect(error).toBeNull();
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);
    const [args] = supabase.auth.signInWithOtp.mock.calls[0];
    expect(args.email).toBe("tanaka@example.com");
    expect(args.options.emailRedirectTo).toMatch(/\/auth\/callback$/);
  });

  it("signInWithGoogle delegates to signInWithOAuth (provider=google)", async () => {
    const { result } = await renderAuth();

    await act(() => result.current.signInWithGoogle());
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signInWithOAuth.mock.calls[0][0].provider).toBe(
      "google",
    );
  });

  it("signInWithMagicLink surfaces the error from supabase-js verbatim", async () => {
    supabase.auth.signInWithOtp.mockResolvedValueOnce({
      data: null,
      error: { message: "rate limited" } as Error,
    });
    const { result } = await renderAuth();

    const out = await act(() =>
      result.current.signInWithMagicLink("tanaka@example.com"),
    );
    expect(out.error).toMatchObject({ message: "rate limited" });
  });

  it("signOut delegates to supabase.auth.signOut", async () => {
    const { result } = await renderAuth();

    await act(() => result.current.signOut());
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from onAuthStateChange on unmount", async () => {
    const unsubscribe = vi.fn();
    supabase.auth.onAuthStateChange.mockReturnValueOnce({
      data: { subscription: { unsubscribe } },
    });

    const { unmount, result } = await renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("AuthProvider — profile fetch race conditions (issue #38)", () => {
  type AuthCallback = (event: string, session: unknown) => void;

  function profileRow(overrides: { id: string; username: string }) {
    return {
      id: overrides.id,
      email: `${overrides.username}@example.com`,
      username: overrides.username,
      display_name: overrides.username,
      avatar_url: null,
      current_project: null,
      bio: null,
      skill_tags: [],
      role: "user",
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    };
  }

  function captureAuthCallback() {
    const ref: { current: AuthCallback | undefined } = { current: undefined };
    supabase.auth.onAuthStateChange.mockImplementationOnce(
      (cb: AuthCallback) => {
        ref.current = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );
    return ref;
  }

  function pendingProfileChainable<T>() {
    // Build a chainable whose `single()` never resolves until the test
    // explicitly calls `resolve`. This lets us model a slow profile fetch
    // (e.g. the one kicked off by getSession) finishing after a newer
    // auth transition has already arrived.
    const chain = chainable<T>();
    let resolveFn!: (
      value:
        | { data: T | null; error: null }
        | { data: null; error: { message: string } },
    ) => void;
    chain.single = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    return { chain, resolve: (v: Parameters<typeof resolveFn>[0]) => resolveFn(v) };
  }

  it("does not let a stale getSession profile fetch overwrite a later sign-in", async () => {
    // getSession resolves with user-1 first.
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "user-1", email: "tanaka@example.com" },
          access_token: "x",
        },
      },
      error: null,
    });

    const cbRef = captureAuthCallback();

    // First from("profiles") call (driven by getSession) hangs; the second
    // (driven by the onAuthStateChange we'll fire below) returns user-2
    // immediately.
    const slow = pendingProfileChainable<ReturnType<typeof profileRow>>();
    supabase.from
      .mockImplementationOnce(() => slow.chain)
      .mockImplementationOnce(() =>
        chainable({
          data: profileRow({ id: "user-2", username: "yamada" }),
          error: null,
        }),
      );

    const { result } = await renderAuth();
    await waitFor(() => expect(cbRef.current).toBeDefined());

    // A new user signs in before the user-1 profile fetch resolves.
    await act(async () => {
      cbRef.current!("SIGNED_IN", {
        user: { id: "user-2", email: "yamada@example.com" },
        access_token: "y",
      });
    });

    await waitFor(() => expect(result.current.profile?.id).toBe("user-2"));

    // Now the stale user-1 fetch finally lands — it must be discarded.
    await act(async () => {
      slow.resolve({
        data: profileRow({ id: "user-1", username: "tanaka" }),
        error: null,
      });
      await Promise.resolve();
    });

    expect(result.current.profile?.id).toBe("user-2");
    expect(result.current.profile?.username).toBe("yamada");
  });

  it("ignores a stale getSession result that arrives after a newer onAuthStateChange", async () => {
    // Models the rollback race: a pending getSession finally resolves with
    // an old session AFTER a newer onAuthStateChange event has updated
    // state. user/session must not regress to the stale value.
    let resolveGetSession!: (value: {
      data: { session: unknown };
      error: null;
    }) => void;
    supabase.auth.getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGetSession = resolve;
      }),
    );

    const cbRef = captureAuthCallback();

    const { result } = await renderAuth({ settle: false });
    await waitFor(() => expect(cbRef.current).toBeDefined());

    // Newer auth event lands first: SIGNED_OUT.
    await act(async () => {
      cbRef.current!("SIGNED_OUT", null);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();

    // The stale getSession now resolves with the OLD session — must be
    // discarded; user/session/profile must not roll back.
    await act(async () => {
      resolveGetSession({
        data: {
          session: {
            user: { id: "user-1", email: "tanaka@example.com" },
            access_token: "x",
          },
        },
        error: null,
      });
      await Promise.resolve();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it("keeps profile null after sign-out even if a prior fetch resolves later", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "user-1", email: "tanaka@example.com" },
          access_token: "x",
        },
      },
      error: null,
    });

    const cbRef = captureAuthCallback();
    const slow = pendingProfileChainable<ReturnType<typeof profileRow>>();
    supabase.from.mockImplementationOnce(() => slow.chain);

    const { result } = await renderAuth();
    await waitFor(() => expect(cbRef.current).toBeDefined());

    // User signs out before the in-flight profile fetch resolves.
    await act(async () => {
      cbRef.current!("SIGNED_OUT", null);
    });
    expect(result.current.profile).toBeNull();
    expect(result.current.user).toBeNull();

    // The stale fetch finally resolves — must not resurrect the old profile.
    await act(async () => {
      slow.resolve({
        data: profileRow({ id: "user-1", username: "tanaka" }),
        error: null,
      });
      await Promise.resolve();
    });

    expect(result.current.profile).toBeNull();
  });

  it("does not drop concurrent profile fetches for the same user (last-resolved wins)", async () => {
    // Pins the new contract: same-userId concurrent fetches BOTH write
    // through and the last-resolved response wins. If a future refactor
    // reverts to a per-call generation that drops earlier requests, this
    // test fails.
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "user-1", email: "tanaka@example.com" },
          access_token: "x",
        },
      },
      error: null,
    });
    const cbRef = captureAuthCallback();

    const slow = pendingProfileChainable<ReturnType<typeof profileRow>>();
    supabase.from
      .mockImplementationOnce(() => slow.chain)
      .mockImplementationOnce(() =>
        chainable({
          data: profileRow({ id: "user-1", username: "second" }),
          error: null,
        }),
      );

    const { result } = await renderAuth();
    await waitFor(() => expect(cbRef.current).toBeDefined());

    // Same user signs in again (e.g. TOKEN_REFRESHED / duplicate
    // INITIAL_SESSION) — kicks off a second, faster fetch for the same id.
    await act(async () => {
      cbRef.current!("SIGNED_IN", {
        user: { id: "user-1", email: "tanaka@example.com" },
        access_token: "x2",
      });
    });
    await waitFor(() =>
      expect(result.current.profile?.username).toBe("second"),
    );

    // The slow first fetch lands later with a different payload. Same
    // userId ⇒ must still write through; last-resolved wins.
    await act(async () => {
      slow.resolve({
        data: profileRow({ id: "user-1", username: "first" }),
        error: null,
      });
      await Promise.resolve();
    });

    expect(result.current.profile?.id).toBe("user-1");
    expect(result.current.profile?.username).toBe("first");
  });
});
