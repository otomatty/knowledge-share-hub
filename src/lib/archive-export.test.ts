import { describe, it, expect } from "vitest";
import {
  archiveBaseFilename,
  toJson,
  toMarkdown,
  type ArchiveExportData,
} from "./archive-export";
import type { Tip, User } from "@/types";

const owner: Pick<User, "id" | "username" | "display_name"> = {
  id: "u1",
  username: "alice",
  display_name: "Alice",
};

function mkTip(overrides: Partial<Tip> = {}): Tip {
  return {
    id: "t1",
    author: {
      id: "u1",
      email: "a@example.com",
      username: "alice",
      display_name: "Alice",
      skill_tags: [],
      created_at: "2026-01-01T00:00:00.000Z",
    },
    content: "気づきの本文",
    is_anonymous: false,
    status: "published",
    tags: [],
    reactions: {
      same_thought: 0,
      new_view: 0,
      try_it: 0,
      learned: 0,
    },
    comment_count: 0,
    created_at: "2026-03-15T10:00:00.000Z",
    ...overrides,
  };
}

function mkData(entries: ArchiveExportData["entries"]): ArchiveExportData {
  return {
    owner,
    generatedAt: "2026-04-19T00:00:00.000Z",
    entries,
  };
}

describe("archive-export", () => {
  describe("toMarkdown", () => {
    it("renders a header with owner and count", () => {
      const md = toMarkdown(mkData([]));
      expect(md).toContain("# Alice の気づきアーカイブ");
      expect(md).toContain("@alice");
      expect(md).toContain("件数: 0");
    });

    it("renders an empty-state line when there are no entries", () => {
      const md = toMarkdown(mkData([]));
      expect(md).toContain("該当する気づきはありません");
    });

    it("groups entries by month newest-first", () => {
      const md = toMarkdown(
        mkData([
          { tip: mkTip({ id: "a", created_at: "2026-02-05T00:00:00.000Z" }), addendums: [] },
          { tip: mkTip({ id: "b", created_at: "2026-03-10T00:00:00.000Z" }), addendums: [] },
        ]),
      );
      const marchIdx = md.indexOf("## 2026-03");
      const febIdx = md.indexOf("## 2026-02");
      expect(marchIdx).toBeGreaterThan(-1);
      expect(febIdx).toBeGreaterThan(marchIdx);
    });

    it("lists tags with leading # and puts context tags first", () => {
      const md = toMarkdown(
        mkData([
          {
            tip: mkTip({
              tags: [
                { id: "t1", name: "react", category: "tech" },
                { id: "t2", name: "#今日の学び", category: "context" },
              ],
            }),
            addendums: [],
          },
        ]),
      );
      const line = md.split("\n").find((l) => l.startsWith("- タグ:"));
      expect(line).toBeDefined();
      expect(line!.indexOf("#今日の学び")).toBeLessThan(line!.indexOf("#react"));
    });

    it("includes reaction counts when non-zero and hides the line when all zero", () => {
      const withRx = toMarkdown(
        mkData([
          {
            tip: mkTip({
              reactions: {
                same_thought: 1,
                new_view: 2,
                try_it: 0,
                learned: 3,
              },
            }),
            addendums: [],
          },
        ]),
      );
      expect(withRx).toContain("🤔1");
      expect(withRx).toContain("💡2");
      expect(withRx).toContain("📘3");

      const noRx = toMarkdown(mkData([{ tip: mkTip(), addendums: [] }]));
      expect(noRx).not.toContain("リアクション:");
    });

    it("includes addendums as a re-read sub-list", () => {
      const md = toMarkdown(
        mkData([
          {
            tip: mkTip(),
            addendums: [
              {
                id: "a1",
                tipId: "t1",
                authorId: "u1",
                content: "一週間後の再読",
                createdAt: "2026-03-22T00:00:00.000Z",
              },
            ],
          },
        ]),
      );
      expect(md).toContain("再読メモ:");
      expect(md).toContain("2026-03-22: 一週間後の再読");
    });

    it("exposes source and result linkage when present", () => {
      const md = toMarkdown(
        mkData([
          {
            tip: mkTip(),
            addendums: [],
            sourceTipId: "src-123",
            resultTipId: "res-456",
          },
        ]),
      );
      expect(md).toContain("派生元: src-123");
      expect(md).toContain("派生先（試した結果）: res-456");
    });

    it("notes anonymous posts", () => {
      const md = toMarkdown(
        mkData([{ tip: mkTip({ is_anonymous: true }), addendums: [] }]),
      );
      expect(md).toContain("匿名投稿");
    });

    it("surfaces filter summary in the header when provided", () => {
      const md = toMarkdown({
        ...mkData([]),
        filterSummary: "2026-03 / #react",
      });
      expect(md).toContain("条件: 2026-03 / #react");
    });
  });

  describe("toJson", () => {
    it("emits a stable schema_version and round-trips via JSON.parse", () => {
      const json = toJson(
        mkData([
          {
            tip: mkTip({
              tags: [{ id: "t1", name: "react", category: "tech" }],
            }),
            addendums: [],
            resultTipId: "r1",
          },
        ]),
      );
      const parsed = JSON.parse(json);
      expect(parsed.schema_version).toBe(1);
      expect(parsed.owner.username).toBe("alice");
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].tags[0]).toEqual({
        name: "react",
        category: "tech",
      });
      expect(parsed.entries[0].result_tip_id).toBe("r1");
      expect(parsed.entries[0].source_tip_id).toBeNull();
    });

    it("uses nulls (not undefined) for missing linkage — JSON can't hold undefined", () => {
      const json = toJson(mkData([{ tip: mkTip(), addendums: [] }]));
      expect(json).toContain('"source_tip_id": null');
      expect(json).toContain('"result_tip_id": null');
    });
  });

  describe("archiveBaseFilename", () => {
    it("replaces filesystem-unsafe characters in usernames", () => {
      const name = archiveBaseFilename("a/b:c", "2026-04-19T00:00:00.000Z");
      expect(name).not.toContain("/");
      expect(name).not.toContain(":");
      expect(name).toContain("a_b_c");
    });

    it("falls back to 'user' when sanitising strips everything", () => {
      const name = archiveBaseFilename("///", "2026-04-19T00:00:00.000Z");
      expect(name).toMatch(/^archive-user-/);
    });
  });
});
