import { describe, it, expect } from "vitest";
import { profileToUser, DISPLAY_NAME_FALLBACK } from "./profile-mapper";
import type { Database } from "@/integrations/supabase/types";

type ProfileRow = Database["knowledge_share_hub"]["Tables"]["profiles"]["Row"];

function mkProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
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
    ...overrides,
  };
}

describe("profileToUser", () => {
  it("maps a fully populated row", () => {
    const row = mkProfile({
      avatar_url: "https://example.com/a.png",
      current_project: "プロジェクトA",
      bio: "自己紹介",
      skill_tags: ["typescript", "react"],
    });
    expect(profileToUser(row)).toEqual({
      id: "user-1",
      email: "tanaka@example.com",
      username: "tanaka",
      display_name: "田中",
      avatar_url: "https://example.com/a.png",
      current_project: "プロジェクトA",
      bio: "自己紹介",
      skill_tags: ["typescript", "react"],
      created_at: "2026-05-01T00:00:00.000Z",
    });
  });

  it("collapses null optional fields to undefined", () => {
    const user = profileToUser(mkProfile());
    expect(user.avatar_url).toBeUndefined();
    expect(user.current_project).toBeUndefined();
    expect(user.bio).toBeUndefined();
  });

  it("defaults skill_tags to [] when DB returns null", () => {
    const row = mkProfile({
      skill_tags: null as unknown as string[],
    });
    expect(profileToUser(row).skill_tags).toEqual([]);
  });

  it("does not leak DB-only fields (role, updated_at)", () => {
    const user = profileToUser(mkProfile({ role: "admin" }));
    expect(user).not.toHaveProperty("role");
    expect(user).not.toHaveProperty("updated_at");
  });

  it("falls back when display_name is null", () => {
    const user = profileToUser(
      mkProfile({ display_name: null as unknown as string }),
    );
    expect(user.display_name).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("falls back when display_name is empty string", () => {
    const user = profileToUser(mkProfile({ display_name: "" }));
    expect(user.display_name).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("falls back when display_name is whitespace-only", () => {
    const user = profileToUser(mkProfile({ display_name: "   " }));
    expect(user.display_name).toBe(DISPLAY_NAME_FALLBACK);
  });
});
