import { describe, it, expect } from "vitest";
import {
  archiveBaseFilename,
  ArchiveExportSizeError,
  MAX_EXPORT_ENTRIES,
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
    // Noon-UTC on fixture timestamps so local-calendar formatting
    // (monthKey / isoDate use local getters by design) lands on the
    // intended day regardless of the test runner's TZ. Tests that
    // previously used midnight-UTC or early-morning-UTC would roll back
    // to the prior day on machines west of UTC (e.g. CI runners set to
    // PST/AKDT). Noon-UTC is safe from UTC−12 through UTC+11.
    created_at: "2026-03-15T12:00:00.000Z",
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
          { tip: mkTip({ id: "a", created_at: "2026-02-05T12:00:00.000Z" }), addendums: [] },
          { tip: mkTip({ id: "b", created_at: "2026-03-10T12:00:00.000Z" }), addendums: [] },
        ]),
      );
      const marchIdx = md.indexOf("## 2026-03");
      const febIdx = md.indexOf("## 2026-02");
      expect(marchIdx).toBeGreaterThan(-1);
      expect(febIdx).toBeGreaterThan(marchIdx);
    });

    it("preserves the caller's within-month ordering", () => {
      // Contract: entries are rendered in the order they're passed in
      // (within a month). useUserArchive already orders
      // `created_at DESC`, so trusting that avoids a redundant sort in
      // the serialiser. This test locks the contract so a future change
      // to the hook's order surfaces here instead of silently scrambling
      // exports.
      const earlier = "2026-03-01T12:00:00.000Z";
      const later = "2026-03-20T12:00:00.000Z";
      const md = toMarkdown(
        mkData([
          { tip: mkTip({ id: "later", created_at: later }), addendums: [] },
          { tip: mkTip({ id: "earlier", created_at: earlier }), addendums: [] },
        ]),
      );
      const laterIdx = md.indexOf("2026-03-20");
      const earlierIdx = md.indexOf("2026-03-01");
      expect(laterIdx).toBeGreaterThan(-1);
      expect(earlierIdx).toBeGreaterThan(laterIdx);
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
                createdAt: "2026-03-22T12:00:00.000Z",
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
            resultTipIds: ["res-456"],
          },
        ]),
      );
      expect(md).toContain("派生元: src-123");
      expect(md).toContain("派生先（試した結果）: res-456");
    });

    it("lists every result tip id — multiple triers don't collapse to one", () => {
      const md = toMarkdown(
        mkData([
          {
            tip: mkTip(),
            addendums: [],
            resultTipIds: ["res-1", "res-2", "res-3"],
          },
        ]),
      );
      expect(md).toContain("派生先（試した結果）: res-1");
      expect(md).toContain("派生先（試した結果）: res-2");
      expect(md).toContain("派生先（試した結果）: res-3");
    });

    it("notes anonymous posts", () => {
      const md = toMarkdown(
        mkData([{ tip: mkTip({ is_anonymous: true }), addendums: [] }]),
      );
      expect(md).toContain("匿名投稿");
    });

    it("flags drafts with a 状態 line and leaves publish-on-create silent", () => {
      const draft = toMarkdown(
        mkData([{ tip: mkTip({ status: "draft" }), addendums: [] }]),
      );
      expect(draft).toContain("状態: 下書き");

      // Tip created and published at the same moment — the archive is a
      // personal backup, not a publish log, so the noise of redundant
      // "公開 (same-date)" lines isn't worth it.
      const samePublished = toMarkdown(
        mkData([
          {
            tip: mkTip({
              status: "published",
              created_at: "2026-03-15T12:00:00.000Z",
              published_at: "2026-03-15T12:00:00.500Z",
            }),
            addendums: [],
          },
        ]),
      );
      expect(samePublished).not.toContain("状態:");
    });

    it("shows publish date for tips promoted from draft", () => {
      // created_at well before published_at → draft promoted later.
      const promoted = toMarkdown(
        mkData([
          {
            tip: mkTip({
              status: "published",
              created_at: "2026-03-15T12:00:00.000Z",
              published_at: "2026-04-02T12:00:00.000Z",
            }),
            addendums: [],
          },
        ]),
      );
      expect(promoted).toContain("状態: 公開 (2026-04-02)");
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
            resultTipIds: ["r1", "r2"],
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
      expect(parsed.entries[0].result_tip_ids).toEqual(["r1", "r2"]);
      expect(parsed.entries[0].source_tip_id).toBeNull();
    });

    it("uses null for missing source and [] for missing results — arrays can hold 'empty' cleanly", () => {
      const json = toJson(mkData([{ tip: mkTip(), addendums: [] }]));
      const parsed = JSON.parse(json);
      expect(parsed.entries[0].source_tip_id).toBeNull();
      expect(parsed.entries[0].result_tip_ids).toEqual([]);
    });

    it("preserves status and published_at so drafts survive a round-trip", () => {
      const json = toJson(
        mkData([
          {
            tip: mkTip({
              status: "draft",
              // A draft has no published_at — export that as null, not
              // as a silent fallback to `created_at` which would mark
              // the row "looks published" on re-import.
              published_at: undefined,
            }),
            addendums: [],
          },
          {
            tip: mkTip({
              id: "t2",
              status: "published",
              published_at: "2026-03-15T12:00:00.000Z",
            }),
            addendums: [],
          },
        ]),
      );
      const parsed = JSON.parse(json);
      expect(parsed.entries[0].status).toBe("draft");
      expect(parsed.entries[0].published_at).toBeNull();
      expect(parsed.entries[1].status).toBe("published");
      expect(parsed.entries[1].published_at).toBe("2026-03-15T12:00:00.000Z");
    });
  });

  describe("size guard", () => {
    it("throws ArchiveExportSizeError with reason 'too-many-entries' when the entry count exceeds the cap", () => {
      // Build a synthetic payload with count = cap + 1. Each entry is
      // tiny, so the byte guard can't fire first — we want to exercise
      // the count branch specifically.
      const entries = Array.from({ length: MAX_EXPORT_ENTRIES + 1 }, (_, i) => ({
        tip: mkTip({ id: `t${i}`, content: "x" }),
        addendums: [],
      }));
      const data = { ...mkData([]), entries };

      expect(() => toMarkdown(data)).toThrowError(ArchiveExportSizeError);
      expect(() => toJson(data)).toThrowError(ArchiveExportSizeError);
      try {
        toMarkdown(data);
      } catch (e) {
        expect(e).toBeInstanceOf(ArchiveExportSizeError);
        expect((e as ArchiveExportSizeError).reason).toBe("too-many-entries");
      }
    });

    it("throws with reason 'too-many-bytes' when estimated payload exceeds the byte cap", () => {
      // A handful of entries, each carrying a very large content
      // string, trips the byte estimate without going near the count
      // cap. The estimator uses `length * 4` as a worst-case UTF-8
      // bound, so a 2 MB JS string counts as ~8 MB — three of them
      // comfortably cross the 20 MB budget.
      const huge = "あ".repeat(2_000_000);
      const entries = [
        { tip: mkTip({ id: "a", content: huge }), addendums: [] },
        { tip: mkTip({ id: "b", content: huge }), addendums: [] },
        { tip: mkTip({ id: "c", content: huge }), addendums: [] },
      ];
      const data = { ...mkData([]), entries };
      try {
        toMarkdown(data);
        throw new Error("expected size error");
      } catch (e) {
        expect(e).toBeInstanceOf(ArchiveExportSizeError);
        expect((e as ArchiveExportSizeError).reason).toBe("too-many-bytes");
      }
    });

    it("lets normal exports through untouched", () => {
      const data = mkData([{ tip: mkTip(), addendums: [] }]);
      expect(() => toMarkdown(data)).not.toThrow();
      expect(() => toJson(data)).not.toThrow();
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
