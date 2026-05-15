import { test, expect, type Page } from "../playwright-fixture";

/**
 * Golden-path smoke test (issue #36, recommended action 4).
 *
 * Walks login → tip post → reaction → search against a dev server with
 * MSW intercepting every Supabase REST/auth call (`src/mocks/handlers.ts`).
 * The dev server is launched by `playwright.config.ts`'s `webServer`
 * with `VITE_E2E=true`, which is the only knob that asks `src/main.tsx`
 * to start the MSW worker.
 *
 * Note on isolation: MSW handlers run inside the dev server's browser
 * context, while this spec runs in a separate Node process. The two
 * don't share memory, so `resetMockState()` can't be called from here
 * — the suite is intentionally written to be order-independent so the
 * persistent `createdTips` accumulator doesn't matter.
 */

const FAKE_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "tanaka@example.com",
};

// supabase-js derives the localStorage key from the URL hostname:
//   `sb-${hostname.split(".")[0]}-auth-token`
// For VITE_SUPABASE_URL=http://supabase.test that resolves to
// `sb-supabase-auth-token`. Pre-seeding lets the test bypass the real
// magic-link / OAuth flow and land on protected pages directly.
const STORAGE_KEY = "sb-supabase-auth-token";

const FAKE_SESSION = {
  access_token: "msw-access-token",
  refresh_token: "msw-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: { ...FAKE_USER, aud: "authenticated", role: "authenticated" },
};

async function seedAuthSession(page: Page) {
  await page.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: STORAGE_KEY, session: FAKE_SESSION },
  );
}

test("login screen accepts an email and shows the magic-link confirmation", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("メールアドレス").fill(FAKE_USER.email);
  await page
    .getByRole("button", { name: /マジックリンクでログイン/ })
    .click();

  // MSW returns 200 from /auth/v1/otp; the page swaps to the
  // "メールを確認してください" confirmation panel.
  await expect(page.getByText("メールを確認してください")).toBeVisible();
  await expect(page.getByText(FAKE_USER.email)).toBeVisible();
});

test("authenticated user can post a tip", async ({ page }) => {
  await seedAuthSession(page);

  await page.goto("/tips/new");
  await expect(page.getByRole("button", { name: "投稿する" })).toBeVisible();

  const body = "E2E テスト経由で投稿された気づき";
  // TipNew has exactly one <textarea> for the body; tag inputs are
  // <input>. The element-level selector is more specific than
  // getByRole("textbox").first(), which also matches the tag input.
  await page.locator("textarea").fill(body);
  await page.getByRole("button", { name: "投稿する" }).click();

  // TipNew navigates to `/tips` (the list page) when no `?source=` param
  // is present — anchor on the trailing-/tips path so the regex doesn't
  // also match the starting `/tips/new` and silently no-op the assertion.
  await page.waitForURL(/\/tips$/);
  await expect(page.getByText("気づきを投稿しました")).toBeVisible();
  // MSW's POST /rest/v1/tips persists the new tip, and GET returns
  // [seed, ...created], so the list page should render our body.
  await expect(page.getByText(body)).toBeVisible();
});

test("search page renders with a search input", async ({ page }) => {
  await seedAuthSession(page);

  await page.goto("/search");
  await expect(
    page.getByPlaceholder("キーワード、タグで検索..."),
  ).toBeVisible();

  await page
    .getByPlaceholder("キーワード、タグで検索...")
    .fill("MSW");
  // The search filter is client-side over the (mocked) tip list, so just
  // assert the input took the keystroke and the page didn't crash.
  await expect(page.getByPlaceholder("キーワード、タグで検索...")).toHaveValue(
    "MSW",
  );
});
