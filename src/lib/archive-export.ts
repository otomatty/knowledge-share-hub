import type { Tag, Tip, User } from "@/types";
import type { TipAddendum } from "@/hooks/use-tip-resurfacings";

/**
 * Pure serializers for the personal archive export (issue #11).
 *
 * Both outputs are built in-memory in the browser from rows that have
 * already passed RLS (owner-only reads). No Edge Function is required —
 * an edge wrapper would just re-fetch the same rows the client already
 * has. Keeping this pure also makes the snapshot tests below the
 * authoritative spec for what exported files look like.
 */

export interface ArchiveEntry {
  tip: Tip;
  addendums: TipAddendum[];
  /** Result tip that this tip was posted as a response to, if any. */
  sourceTipId?: string;
  /** Result tip id posted in response to this tip, if any. */
  resultTipId?: string;
}

export interface ArchiveExportData {
  owner: Pick<User, "id" | "username" | "display_name">;
  generatedAt: string;
  /**
   * Optional human-readable filter summary — rendered into the Markdown
   * header so a downloaded file is self-describing. Kept separate from
   * the data payload so callers can format filters however they like.
   */
  filterSummary?: string;
  entries: ArchiveEntry[];
}

// ---------------------------------------------------------------------------
// Formatting helpers

function isoDate(s: string): string {
  // `YYYY-MM-DD` from an ISO timestamp, in the user's local calendar.
  const d = new Date(s);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(s: string): string {
  const d = new Date(s);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function tagLabel(tag: Tag): string {
  // Context tags already carry a leading `#` in seeded data; tech tags
  // don't. Normalize so Markdown reads `#tag` either way.
  return tag.name.startsWith("#") ? tag.name : `#${tag.name}`;
}

function sortTagsForExport(tags: Tag[]): Tag[] {
  // Context tags first so the "mental frame" of the tip leads, mirroring
  // ContentCard's visual order.
  return [...tags].sort((a, b) => {
    if (a.category === b.category) return a.name.localeCompare(b.name);
    return a.category === "context" ? -1 : 1;
  });
}

// ---------------------------------------------------------------------------
// Markdown

export function toMarkdown(data: ArchiveExportData): string {
  const lines: string[] = [];
  lines.push(`# ${data.owner.display_name} の気づきアーカイブ`);
  lines.push("");
  lines.push(`- ユーザー: @${data.owner.username}`);
  lines.push(`- 生成日時: ${data.generatedAt}`);
  lines.push(`- 件数: ${data.entries.length}`);
  if (data.filterSummary) {
    lines.push(`- 条件: ${data.filterSummary}`);
  }
  lines.push("");

  if (data.entries.length === 0) {
    lines.push("_該当する気づきはありません。_");
    lines.push("");
    return lines.join("\n");
  }

  // Group by YYYY-MM so the reader can skim by month. Newest-first, to
  // match the app feed.
  const byMonth = new Map<string, ArchiveEntry[]>();
  for (const e of data.entries) {
    const key = monthKey(e.tip.created_at);
    const list = byMonth.get(key);
    if (list) list.push(e);
    else byMonth.set(key, [e]);
  }
  const monthKeys = [...byMonth.keys()].sort().reverse();

  for (const mk of monthKeys) {
    lines.push(`## ${mk}`);
    lines.push("");
    const entries = byMonth.get(mk) ?? [];
    entries.sort(
      (a, b) =>
        new Date(b.tip.created_at).getTime() -
        new Date(a.tip.created_at).getTime(),
    );
    for (const e of entries) {
      const t = e.tip;
      lines.push(`### ${isoDate(t.created_at)}`);
      lines.push("");
      lines.push(t.content);
      lines.push("");

      const tags = sortTagsForExport(t.tags);
      if (tags.length > 0) {
        lines.push(`- タグ: ${tags.map(tagLabel).join(" ")}`);
      }
      const rx = t.reactions;
      const rxTotal = rx.same_thought + rx.new_view + rx.try_it + rx.learned;
      if (rxTotal > 0) {
        lines.push(
          `- リアクション: 🤔${rx.same_thought} 💡${rx.new_view} 🔁${rx.try_it} 📘${rx.learned}`,
        );
      }
      if (t.is_anonymous) {
        lines.push(`- 匿名投稿`);
      }
      if (e.sourceTipId) {
        lines.push(`- 派生元: ${e.sourceTipId}`);
      }
      if (e.resultTipId) {
        lines.push(`- 派生先（試した結果）: ${e.resultTipId}`);
      }

      if (e.addendums.length > 0) {
        lines.push("");
        lines.push("**再読メモ:**");
        for (const a of e.addendums) {
          lines.push(`- ${isoDate(a.createdAt)}: ${a.content}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON

export interface ArchiveJsonEntry {
  id: string;
  content: string;
  created_at: string;
  is_anonymous: boolean;
  tags: { name: string; category: "tech" | "context" }[];
  reactions: Tip["reactions"];
  source_tip_id: string | null;
  result_tip_id: string | null;
  addendums: { id: string; content: string; created_at: string }[];
}

export interface ArchiveJsonPayload {
  schema_version: 1;
  generated_at: string;
  owner: Pick<User, "id" | "username" | "display_name">;
  filter_summary: string | null;
  count: number;
  entries: ArchiveJsonEntry[];
}

export function toJson(data: ArchiveExportData): string {
  const payload: ArchiveJsonPayload = {
    schema_version: 1,
    generated_at: data.generatedAt,
    owner: data.owner,
    filter_summary: data.filterSummary ?? null,
    count: data.entries.length,
    entries: data.entries.map((e) => ({
      id: e.tip.id,
      content: e.tip.content,
      created_at: e.tip.created_at,
      is_anonymous: e.tip.is_anonymous,
      tags: e.tip.tags.map((t) => ({ name: t.name, category: t.category })),
      reactions: e.tip.reactions,
      source_tip_id: e.sourceTipId ?? null,
      result_tip_id: e.resultTipId ?? null,
      addendums: e.addendums.map((a) => ({
        id: a.id,
        content: a.content,
        created_at: a.createdAt,
      })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------------------
// Filename helpers

/**
 * Safe base filename for a downloaded archive. Username is sanitised
 * because we put it directly into an `a[download]` attribute; browsers
 * do strip some characters but Safari on macOS will happily preserve
 * slashes, which download managers then interpret as directories.
 */
export function archiveBaseFilename(
  username: string,
  generatedAt: string,
): string {
  const sanitised = username.replace(/[^A-Za-z0-9_-]/g, "_");
  // A result of only fillers (underscores/dashes) is just noise — fall
  // back to a generic name so the downloaded file is still legible.
  const safeUser = /[A-Za-z0-9]/.test(sanitised) ? sanitised : "user";
  const safeTs = generatedAt.replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
  return `archive-${safeUser}-${safeTs}`;
}
