import { http, HttpResponse } from "msw";

/**
 * MSW handlers for the golden-path E2E (login → tip post → reaction →
 * search). Intentionally narrow: just enough surface for the four pages
 * the spec walks through, with empty-list defaults for everything else
 * so the rest of the app renders without 404 noise.
 *
 * Supabase URL: `import.meta.env.VITE_SUPABASE_URL` is set to
 * `http://supabase.test` in `src/main.tsx` when E2E mode is on. All
 * handlers route off that origin — `*` matches the host so we don't
 * couple to a specific port.
 */

const SUPABASE = "http://supabase.test";

const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "tanaka@example.com",
  aud: "authenticated",
  role: "authenticated",
};

const TEST_PROFILE = {
  id: TEST_USER.id,
  email: TEST_USER.email,
  username: "tanaka",
  display_name: "田中",
  avatar_url: null,
  current_project: null,
  bio: null,
  skill_tags: [],
  role: "user",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

const SEED_TIP = {
  id: "tip-seed-1",
  author_id: TEST_USER.id,
  content: "MSW で配信したシード気づき",
  is_anonymous: false,
  status: "published",
  published_at: "2026-05-01T00:00:00.000Z",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  author: TEST_PROFILE,
  tip_tags: [],
};

let nextTipId = 1;
const createdTips: typeof SEED_TIP[] = [];

function fakeSession() {
  return {
    access_token: "msw-access-token",
    refresh_token: "msw-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: TEST_USER,
  };
}

export const handlers = [
  // ── Auth ──────────────────────────────────────────────────────
  // signInWithOtp (magic link). Returns 200 with empty body; the real
  // flow hands the user a link via email — for E2E we treat the click
  // as success and let the test navigate directly to the next page.
  http.post(`${SUPABASE}/auth/v1/otp`, () => HttpResponse.json({})),
  // Initial getSession + token refresh.
  http.post(`${SUPABASE}/auth/v1/token`, () =>
    HttpResponse.json(fakeSession()),
  ),
  http.get(`${SUPABASE}/auth/v1/user`, () => HttpResponse.json(TEST_USER)),
  http.post(`${SUPABASE}/auth/v1/logout`, () => new HttpResponse(null, { status: 204 })),

  // ── Profiles ──────────────────────────────────────────────────
  http.get(`${SUPABASE}/rest/v1/profiles`, () =>
    HttpResponse.json([TEST_PROFILE]),
  ),

  // ── Tips ──────────────────────────────────────────────────────
  http.get(`${SUPABASE}/rest/v1/tips`, () =>
    HttpResponse.json([SEED_TIP, ...createdTips]),
  ),
  http.post(`${SUPABASE}/rest/v1/tips`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const id = `tip-msw-${nextTipId++}`;
    const created = {
      ...SEED_TIP,
      ...body,
      id,
      author: TEST_PROFILE,
      tip_tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    };
    createdTips.push(created as typeof SEED_TIP);
    return HttpResponse.json([created], { status: 201 });
  }),

  // ── Reactions ─────────────────────────────────────────────────
  http.get(`${SUPABASE}/rest/v1/reactions`, () => HttpResponse.json([])),
  http.post(`${SUPABASE}/rest/v1/reactions`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json([body], { status: 201 });
  }),
  http.delete(`${SUPABASE}/rest/v1/reactions`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // ── Tags ──────────────────────────────────────────────────────
  http.get(`${SUPABASE}/rest/v1/tags`, () => HttpResponse.json([])),
  http.get(`${SUPABASE}/rest/v1/tip_tags`, () => HttpResponse.json([])),
  http.get(`${SUPABASE}/rest/v1/tag_follows`, () => HttpResponse.json([])),

  // ── Comments ──────────────────────────────────────────────────
  http.get(`${SUPABASE}/rest/v1/comments`, () => HttpResponse.json([])),

  // ── Notifications ─────────────────────────────────────────────
  http.get(`${SUPABASE}/rest/v1/notifications`, () => HttpResponse.json([])),

  // ── Tip attempts / resurfacings / addendums ──────────────────
  http.get(`${SUPABASE}/rest/v1/tip_attempts_public`, () =>
    HttpResponse.json([]),
  ),
  http.get(`${SUPABASE}/rest/v1/tip_resurfacings`, () =>
    HttpResponse.json([]),
  ),
  http.get(`${SUPABASE}/rest/v1/tip_addendums`, () => HttpResponse.json([])),
];
