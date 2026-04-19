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
  /**
   * Source tip that this tip was posted as a response to, if any.
   * Stays singular because the DB enforces a unique
   * `result_tip_id` → source (migration 00011), so one result can't
   * trace back to two sources.
   */
  sourceTipId?: string;
  /**
   * Every result tip posted in response to this source tip. Multiple
   * users can try the same source and post different results, so
   * collapsing to a single id would silently drop attempts from the
   * backup (PR #28 coderabbit).
   */
  resultTipIds?: string[];
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
// Size guard

/**
 * Upper bound on the estimated payload before we refuse to serialise.
 *
 * The archive is already materialised in memory by `useUserArchive`
 * before either serialiser runs, so streaming just the serialiser
 * wouldn't prevent OOM on a genuinely enormous archive. Instead we cap
 * the serialiser input with a count and a byte budget: callers get a
 * clear, typed error they can surface as "期間を絞って再度お試しください"
 * rather than a frozen tab or a silent truncation (PR #28 coderabbit).
 *
 * Numbers chosen to be generous — tips have a 140-char CHECK, so the
 * byte budget tolerates tens of thousands of tips with addendums. If a
 * user hits the cap, filtering by month or tag keeps them productive.
 */
export const MAX_EXPORT_ENTRIES = 10_000;
export const MAX_EXPORT_CONTENT_BYTES = 20 * 1024 * 1024;

export class ArchiveExportSizeError extends Error {
  constructor(
    message: string,
    readonly reason: "too-many-entries" | "too-many-bytes",
    readonly detail: { count: number; estimatedBytes: number },
  ) {
    super(message);
    this.name = "ArchiveExportSizeError";
  }
}

function assertSizeWithinLimit(data: ArchiveExportData): void {
  if (data.entries.length > MAX_EXPORT_ENTRIES) {
    throw new ArchiveExportSizeError(
      `エクスポート件数が多すぎます (${data.entries.length} > ${MAX_EXPORT_ENTRIES})。期間やタグで絞って再度お試しください。`,
      "too-many-entries",
      { count: data.entries.length, estimatedBytes: 0 },
    );
  }
  // UTF-8 worst case is 4 bytes per code unit; we use `.length` (UTF-16
  // code units) as a conservative upper bound and pad for metadata
  // overhead per entry/addendum so the estimate is pessimistic by
  // design. False-negatives (letting through a payload that later
  // bloats) are worse than false-positives.
  let bytes = 0;
  for (const e of data.entries) {
    bytes += e.tip.content.length * 4 + 512;
    for (const a of e.addendums) bytes += a.content.length * 4 + 256;
    bytes += e.tip.tags.length * 64;
    if (e.resultTipIds) bytes += e.resultTipIds.length * 64;
  }
  if (bytes > MAX_EXPORT_CONTENT_BYTES) {
    throw new ArchiveExportSizeError(
      `エクスポート量が大きすぎます (推定 ${Math.round(bytes / 1024 / 1024)}MB > ${Math.round(MAX_EXPORT_CONTENT_BYTES / 1024 / 1024)}MB)。期間やタグで絞って再度お試しください。`,
      "too-many-bytes",
      { count: data.entries.length, estimatedBytes: bytes },
    );
  }
}

// ---------------------------------------------------------------------------
// Markdown

export function toMarkdown(data: ArchiveExportData): string {
  assertSizeWithinLimit(data);
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
    // Callers are expected to pass entries newest-first (that's the
    // order `useUserArchive` and the public feed both produce), and the
    // grouping above preserves insertion order per-month. No re-sort
    // needed here — re-sorting would silently paper over a caller that
    // passed data in a different order, hiding the upstream bug.
    const entries = byMonth.get(mk) ?? [];
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
      if (t.status === "draft") {
        lines.push(`- 状態: 下書き`);
      } else if (t.published_at) {
        // Only surface `published_at` when it differs from `created_at`
        // — for the common case (publish-on-create) the extra line is
        // noise, but a tip promoted from draft has a real publish date
        // that the reader of the export will want.
        const published = new Date(t.published_at).getTime();
        const created = new Date(t.created_at).getTime();
        if (Math.abs(published - created) > 60_000) {
          lines.push(`- 状態: 公開 (${isoDate(t.published_at)})`);
        }
      }
      if (t.is_anonymous) {
        lines.push(`- 匿名投稿`);
      }
      if (e.sourceTipId) {
        lines.push(`- 派生元: ${e.sourceTipId}`);
      }
      if (e.resultTipIds && e.resultTipIds.length > 0) {
        // One line per result so long id lists stay readable in diffs
        // and no information is lost when multiple people try the same
        // tip.
        for (const rid of e.resultTipIds) {
          lines.push(`- 派生先（試した結果）: ${rid}`);
        }
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
  /**
   * Published vs draft. Preserved so a backup JSON can round-trip the
   * distinction — this export includes drafts on purpose, so dropping
   * `status` would make re-imports silently mark everything published.
   */
  status: Tip["status"];
  published_at: string | null;
  is_anonymous: boolean;
  tags: { name: string; category: "tech" | "context" }[];
  reactions: Tip["reactions"];
  source_tip_id: string | null;
  /**
   * Always an array (possibly empty). Multiple triers produce multiple
   * result tips for the same source; backup consumers should treat
   * this as a list rather than a single linkage.
   */
  result_tip_ids: string[];
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
  assertSizeWithinLimit(data);
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
      status: e.tip.status,
      published_at: e.tip.published_at ?? null,
      is_anonymous: e.tip.is_anonymous,
      tags: e.tip.tags.map((t) => ({ name: t.name, category: t.category })),
      reactions: e.tip.reactions,
      source_tip_id: e.sourceTipId ?? null,
      result_tip_ids: e.resultTipIds ?? [],
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
