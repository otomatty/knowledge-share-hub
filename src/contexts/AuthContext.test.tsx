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
    expect(() => renderHook(() => useAuth())).toThrow(
      /useAuth must be used within an AuthProvider/,
    );
    errSpy.mockRestore();
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
