import { vi } from "vitest";

/**
 * A chainable PostgREST query builder mock that mirrors the surface
 * supabase-js exposes via `supabase.from(...)`.
 *
 * Every filter/order/range/insert/update/delete/upsert method returns
 * the same builder so calls compose like the real client. The builder
 * itself is `await`-able (thenable) and `single`/`maybeSingle` resolve
 * to the configured response. Tests can:
 *
 *   - configure the resolved response upfront via `chainable(response)`,
 *   - assert which methods were called via the per-method `vi.fn` spies
 *     (`builder.eq.mock.calls`, `builder.insert.mock.calls`, ...).
 */
// `data` is optional in the "no error" branch so the chainable's default
// `{ data: null, error: null }` response — used whenever a test doesn't
// configure a specific table response — type-checks without a cast.
export type SupabaseQueryResponse<T = unknown> =
  | { data: T | null; error: null }
  | { data: null; error: { message: string } };

export interface ChainableBuilder<T = unknown> {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: <TResult1 = SupabaseQueryResponse<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseQueryResponse<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
  catch: <TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ) => Promise<SupabaseQueryResponse<T> | TResult>;
  finally: (onfinally?: (() => void) | null) => Promise<SupabaseQueryResponse<T>>;
}

export function chainable<T = unknown>(
  response: SupabaseQueryResponse<T> = { data: null, error: null },
): ChainableBuilder<T> {
  const builder = {} as ChainableBuilder<T>;

  const chainMethods = [
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
    "neq",
    "in",
    "is",
    "lt",
    "gt",
    "gte",
    "order",
    "limit",
    "range",
  ] as const;

  for (const m of chainMethods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(response));
  builder.maybeSingle = vi.fn(() => Promise.resolve(response));
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(response).then(onFulfilled, onRejected);
  // `.catch()` / `.finally()` on a Supabase query chain are valid
  // PromiseLike entrypoints; mirroring them keeps the mock compatible
  // with code that doesn't go through `await`.
  builder.catch = (onRejected) => Promise.resolve(response).catch(onRejected);
  builder.finally = (onFinally) =>
    Promise.resolve(response).finally(onFinally);
  return builder;
}

/** Auth-side mock; mirrors `supabase.auth`. */
export interface SupabaseAuthMock {
  getSession: ReturnType<typeof vi.fn>;
  onAuthStateChange: ReturnType<typeof vi.fn>;
  signInWithOtp: ReturnType<typeof vi.fn>;
  signInWithOAuth: ReturnType<typeof vi.fn>;
  signInWithPassword: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
}

export interface SupabaseClientMock {
  from: ReturnType<typeof vi.fn>;
  auth: SupabaseAuthMock;
  schema: ReturnType<typeof vi.fn>;
}

/**
 * Reset every spy on `mock` and reinstall the default behaviours
 * (empty `from()` builder, signed-out session, no-op auth subscriptions).
 *
 * Hook tests share a single hoisted `mockSupabase` instance because
 * `src/lib/supabase.ts` captures the result of `createClient()` at module
 * load — replacing the instance per-test would leave the singleton
 * pointing at a stale client. Reset-in-place keeps the reference stable.
 */
export function resetSupabaseMock(mock: SupabaseClientMock): void {
  mock.from.mockReset().mockImplementation(() => chainable());
  mock.schema.mockReset().mockReturnValue(mock);
  mock.auth.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: null }, error: null });
  mock.auth.onAuthStateChange.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mock.auth.signInWithOtp
    .mockReset()
    .mockResolvedValue({ data: {}, error: null });
  mock.auth.signInWithOAuth
    .mockReset()
    .mockResolvedValue({ data: {}, error: null });
  mock.auth.signInWithPassword
    .mockReset()
    .mockResolvedValue({ data: {}, error: null });
  mock.auth.signOut.mockReset().mockResolvedValue({ error: null });
}

/**
 * Build a hoist-friendly mock client. Call inside `vi.hoisted(...)` so
 * the `vi.mock("@supabase/supabase-js")` factory below it can return
 * the same instance the test body holds. Always pair with
 * `resetSupabaseMock` in `beforeEach` to scrub call history.
 */
export function createSupabaseMock(): SupabaseClientMock {
  const auth: SupabaseAuthMock = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithOtp: vi.fn(),
    signInWithOAuth: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  };
  const client: SupabaseClientMock = {
    from: vi.fn(),
    auth,
    schema: vi.fn(),
  };
  resetSupabaseMock(client);
  return client;
}
