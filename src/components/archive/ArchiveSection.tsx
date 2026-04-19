import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentCard } from "@/components/shared/ContentCard";
import { useUserArchive } from "@/hooks/use-user-archive";
import {
  archiveBaseFilename,
  toJson,
  toMarkdown,
  type ArchiveEntry,
  type ArchiveExportData,
} from "@/lib/archive-export";
import type { User } from "@/types";
import { Download, X } from "lucide-react";
import { ja } from "date-fns/locale";

interface ArchiveSectionProps {
  userId: string;
  owner: Pick<User, "id" | "username" | "display_name">;
}

type MonthKey = string; // "YYYY-MM"

// Sentinel used only for the `<Select>` "no filter" option. A null byte
// can't appear in Postgres `text` values (the driver rejects them), so
// this can never collide with a real month key or tag name and the
// public `filter` state can stay `string | null` — the sentinel is an
// internal detail of the Select contract, not something exports see.
const NO_FILTER = "\u0000all";

// `monthKeyOf` and `ymd` intentionally use the viewer's local calendar,
// not UTC. The archive answers "what did I post in March?" — if a tip
// was written at 23:30 JST on March 31 (UTC: April 1), the user expects
// it in the March bucket and in the March-31 calendar cell, not in
// April 1. Same convention as `insight-prompts.ts`'s per-day rotation.
// The machine-readable `生成日時` on exports stays UTC-ISO so data
// consumers have an unambiguous instant, even when the human labels
// around it are local-calendar.
function monthKeyOf(iso: string): MonthKey {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Format a tag for display/export. Context tags already carry a leading
 * `#` in seeded data; tech tags don't, so we prefix them here so a
 * filter-summary label like "#react" reads consistently across both.
 */
function formatTagLabel(
  name: string,
  category: "tech" | "context",
): string {
  if (category === "context") return name;
  return name.startsWith("#") ? name : `#${name}`;
}

function buildFilterSummary(params: {
  month: MonthKey | null;
  tagLabel: string | null;
  day: Date | null;
}): string | undefined {
  const parts: string[] = [];
  if (params.day) parts.push(ymd(params.day));
  else if (params.month) parts.push(params.month);
  if (params.tagLabel) parts.push(params.tagLabel);
  return parts.length > 0 ? parts.join(" / ") : undefined;
}

function triggerDownload(filename: string, mime: string, body: string) {
  // Dedicated Blob URL so the browser handles the download without
  // navigation. The URL is revoked on next tick — some browsers need it
  // to survive the click dispatch, so we can't revoke synchronously.
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ArchiveSection({ userId, owner }: ArchiveSectionProps) {
  const { data: entries = [], isLoading, isError } = useUserArchive(userId);

  const [month, setMonth] = useState<MonthKey | null>(null);
  const [tagName, setTagName] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Derive the month options from the actual data — an empty month should
  // not appear in the dropdown, or the filter would silently render "0件".
  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) s.add(monthKeyOf(e.tip.created_at));
    return [...s].sort().reverse();
  }, [entries]);

  const tagOptions = useMemo(() => {
    const map = new Map<string, "tech" | "context">();
    for (const e of entries) {
      for (const t of e.tip.tags) map.set(t.name, t.category);
    }
    return [...map.entries()]
      .map(([name, category]) => ({ name, category }))
      .sort((a, b) => {
        if (a.category !== b.category) return a.category === "context" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [entries]);

  const daysWithEntries = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(ymd(new Date(e.tip.created_at)));
    return set;
  }, [entries]);

  const filtered: ArchiveEntry[] = useMemo(() => {
    return entries.filter((e) => {
      if (selectedDay && ymd(new Date(e.tip.created_at)) !== ymd(selectedDay)) {
        return false;
      }
      if (!selectedDay && month && monthKeyOf(e.tip.created_at) !== month) {
        return false;
      }
      if (tagName && !e.tip.tags.some((t) => t.name === tagName)) {
        return false;
      }
      return true;
    });
  }, [entries, month, tagName, selectedDay]);

  const selectedTagOption = useMemo(
    () => (tagName ? tagOptions.find((t) => t.name === tagName) : undefined),
    [tagName, tagOptions],
  );
  const filterSummary = buildFilterSummary({
    month,
    tagLabel: selectedTagOption
      ? formatTagLabel(selectedTagOption.name, selectedTagOption.category)
      : null,
    day: selectedDay,
  });

  const download = (kind: "md" | "json") => {
    const now = new Date().toISOString();
    const data: ArchiveExportData = {
      owner,
      generatedAt: now,
      filterSummary,
      entries: filtered,
    };
    const base = archiveBaseFilename(owner.username, now);
    if (kind === "md") {
      triggerDownload(`${base}.md`, "text/markdown;charset=utf-8", toMarkdown(data));
    } else {
      triggerDownload(
        `${base}.json`,
        "application/json;charset=utf-8",
        toJson(data),
      );
    }
  };

  if (isLoading) {
    return <p className="text-muted-foreground py-8">アーカイブを読み込み中…</p>;
  }
  if (isError) {
    return (
      <p className="text-destructive py-8">
        アーカイブの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border p-4">
        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
          <div className="shrink-0">
            <Calendar
              mode="single"
              locale={ja}
              selected={selectedDay ?? undefined}
              onSelect={(d) => setSelectedDay(d ?? null)}
              modifiers={{
                hasEntry: (d) => daysWithEntries.has(ymd(d)),
              }}
              modifiersClassNames={{
                hasEntry:
                  "font-semibold text-primary underline underline-offset-4 decoration-primary/60",
              }}
            />
            <p className="text-xs text-muted-foreground mt-1 px-1">
              下線のついた日に投稿があります
            </p>
          </div>

          <div className="flex-1 space-y-3 mt-4 md:mt-0">
            <div className="flex flex-wrap gap-2 items-center">
              <Select
                value={month ?? NO_FILTER}
                onValueChange={(v) => {
                  setMonth(v === NO_FILTER ? null : v);
                  setSelectedDay(null);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="月を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FILTER}>すべての月</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={tagName ?? NO_FILTER}
                onValueChange={(v) =>
                  setTagName(v === NO_FILTER ? null : v)
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="タグで絞り込み" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FILTER}>すべてのタグ</SelectItem>
                  {tagOptions.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {formatTagLabel(t.name, t.category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(selectedDay || month || tagName) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMonth(null);
                    setTagName(null);
                    setSelectedDay(null);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  条件をクリア
                </Button>
              )}

              <div className="flex-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1">
                    <Download className="h-4 w-4" />
                    エクスポート
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => download("md")}>
                    Markdown (.md)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => download("json")}>
                    JSON (.json)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap gap-2 items-center text-sm">
              <Badge variant="secondary">全{entries.length}件</Badge>
              <Badge>表示中 {filtered.length}件</Badge>
              {filterSummary && (
                <span className="text-muted-foreground text-xs">
                  条件: {filterSummary}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {entries.length === 0
            ? "まだ気づきがありません"
            : "条件に一致する気づきがありません"}
        </p>
      ) : (
        <div className="bg-card rounded-lg border divide-y">
          {filtered.map((e) => (
            <div key={e.tip.id} className="px-4">
              <ContentCard data={e.tip} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
