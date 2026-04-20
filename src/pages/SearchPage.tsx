import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContentCard } from "@/components/shared/ContentCard";
import { TagFollowButton } from "@/components/shared/TagFollowButton";
import { Search as SearchIcon } from "lucide-react";
import { useTipsMapped } from "@/hooks/use-domain-queries";
import { useTags } from "@/hooks/use-supabase-query";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || searchParams.get("tag") || "";
  const [query, setQuery] = useState(initialQuery);
  const [contextFilter, setContextFilter] = useState<string | null>(null);
  // Tech-tag filter is a strict tag-name equality match against
  // `tip.tags` where `category === "tech"` — not a substring keyword
  // search. Previously the tech chip populated the keyword input,
  // which meant "react" matched any tip whose *content* contained
  // "react" as a substring (e.g. tips talking about React Native
  // without the tag, or unrelated usages like "reactive" / "react to").
  // That contradicts the "技術タグで絞り込み" section label.
  const [techFilter, setTechFilter] = useState<string | null>(null);

  const tipsQ = useTipsMapped();
  const { data: dbTags = [] } = useTags();
  const contextTags = dbTags.filter((t) => t.category === "context");
  // Render *all* tech tags here, not just the trending top-N. The
  // RightSidebar "技術タグ" card is popularity-limited by design
  // (trending surface), but this section is the canonical
  // browse-and-follow entry point, so newly created or
  // low-frequency tags still need a follow control somewhere —
  // otherwise users can't follow them at all.
  const techTags = dbTags.filter((t) => t.category === "tech");
  const loading = tipsQ.isLoading;

  // The URL is the source of truth. Keep local `query` / `contextFilter` in
  // sync with `?q=` / `?tag=` so that:
  //   - keyword and context filter can coexist (`?q=react&tag=#今日の学び`)
  //   - inbound links from other pages (e.g. ContentCard tag links) that use
  //     `?tag=` with a context tag name lift into the dedicated filter
  //   - legacy `?tag=<tech>` links still populate the keyword field
  useEffect(() => {
    const tagParam = searchParams.get("tag");
    const qParam = searchParams.get("q");
    const contextMatch = dbTags.some(
      (t) => t.category === "context" && t.name === tagParam,
    );
    if (tagParam && contextMatch) {
      setContextFilter(tagParam);
      setQuery(qParam || "");
    } else {
      setQuery(qParam || tagParam || "");
      setContextFilter(null);
    }
  }, [searchParams, dbTags]);

  const toggleContextFilter = (name: string) => {
    const next = new URLSearchParams(searchParams);
    if (next.get("tag") === name) {
      next.delete("tag");
    } else {
      next.set("tag", name);
    }
    setSearchParams(next, { replace: true });
  };

  // Tech filter lives in local state only — not URL-synced in this
  // PR to avoid colliding with the legacy `?tag=<tech>` keyword-
  // populator path that inbound links from other pages rely on.
  // Migrating those links to a new `?techtag=` param is a separate
  // cleanup; for now, opt-in strict matching happens only when a
  // user clicks a tech chip on this page.
  const toggleTechFilter = (name: string) => {
    setTechFilter((current) => (current === name ? null : name));
  };

  const results = useMemo(() => {
    const q = query.toLowerCase();
    const all = tipsQ.data ?? [];
    if (!q && !contextFilter && !techFilter) return [];
    return all.filter((t) => {
      const matchesQuery =
        !q ||
        t.content.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.name.toLowerCase().includes(q));
      const matchesContext =
        !contextFilter ||
        t.tags.some(
          (tag) => tag.category === "context" && tag.name === contextFilter,
        );
      const matchesTech =
        !techFilter ||
        t.tags.some(
          (tag) => tag.category === "tech" && tag.name === techFilter,
        );
      return matchesQuery && matchesContext && matchesTech;
    });
  }, [tipsQ.data, query, contextFilter, techFilter]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const next = new URLSearchParams(searchParams);
    // Preserve `?tag=` only when it's an active context filter. A legacy
    // tech-tag param (from inbound links) gets cleared once the user starts
    // typing, since the keyword field supersedes it.
    const currentTag = next.get("tag");
    const isContextTag = dbTags.some(
      (t) => t.category === "context" && t.name === currentTag,
    );
    if (!isContextTag) next.delete("tag");
    if (value) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-bold mb-4">気づきを探す</h1>
        <div className="relative mb-4">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="キーワード、タグで検索..."
            className="pl-10 h-12 text-base"
          />
        </div>
        {contextTags.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-muted-foreground mb-2">
              気づきの種類で絞り込み
            </p>
            <div className="flex flex-wrap gap-1.5">
              {contextTags.map((tag) => {
                const active = contextFilter === tag.name;
                return (
                  <div key={tag.id} className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleContextFilter(tag.name)}
                      aria-pressed={active}
                      className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full"
                    >
                      <Badge
                        variant={active ? "default" : "outline"}
                        className={
                          active
                            ? "bg-kh-purple text-white hover:bg-kh-purple/80 cursor-pointer"
                            : "border-kh-purple/40 text-kh-purple hover:bg-kh-purple/10 cursor-pointer"
                        }
                      >
                        {tag.name}
                      </Badge>
                    </button>
                    <TagFollowButton tag={tag} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Mobile-visible follow entry point for tech tags. The
            RightSidebar trending "技術タグ" card is `hidden lg:block`
            *and* popularity-limited, so phone/tablet users and anyone
            looking for a less-used tag need this full list as a
            reachable follow surface. Chip click toggles a strict
            tag-equality filter (parity with the context chips right
            above); the bell follows/unfollows. */}
        {techTags.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-muted-foreground mb-2">
              技術タグで絞り込み
            </p>
            <div className="flex flex-wrap gap-1.5">
              {techTags.map((tag) => {
                const active = techFilter === tag.name;
                return (
                  <div key={tag.id} className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleTechFilter(tag.name)}
                      aria-pressed={active}
                      className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full"
                    >
                      <Badge
                        variant={active ? "default" : "secondary"}
                        className={
                          active
                            ? "bg-primary text-primary-foreground hover:bg-primary/80 cursor-pointer"
                            : "hover:bg-primary/10 hover:text-primary cursor-pointer"
                        }
                      >
                        {tag.name}
                      </Badge>
                    </button>
                    <TagFollowButton tag={tag} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground mb-4">読み込み中…</p>
        )}
        {(query || contextFilter || techFilter) && (
          <p className="text-sm text-muted-foreground mb-4">
            {[
              query && `「${query}」`,
              contextFilter,
              techFilter,
            ]
              .filter(Boolean)
              .join(" × ")}
            の検索結果: {results.length}件
          </p>
        )}
        <div className="bg-card rounded-lg border divide-y">
          {results.map((tip) => (
            <div key={tip.id} className="px-4">
              <ContentCard data={tip} />
            </div>
          ))}
          {(query || contextFilter || techFilter) &&
            results.length === 0 &&
            !loading && (
              <p className="text-center text-muted-foreground py-12">
                検索結果が見つかりませんでした
              </p>
            )}
          {!query && !contextFilter && !techFilter && (
            <p className="text-center text-muted-foreground py-12">
              キーワードまたはタグを選択してください
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
