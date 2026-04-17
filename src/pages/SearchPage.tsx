import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContentCard } from "@/components/shared/ContentCard";
import { Search as SearchIcon } from "lucide-react";
import { useTipsMapped } from "@/hooks/use-domain-queries";
import { useTags } from "@/hooks/use-supabase-query";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || searchParams.get("tag") || "";
  const [query, setQuery] = useState(initialQuery);
  const [contextFilter, setContextFilter] = useState<string | null>(null);

  const tipsQ = useTipsMapped();
  const { data: dbTags = [] } = useTags();
  const contextTags = dbTags.filter((t) => t.category === "context");
  const loading = tipsQ.isLoading;

  // Sync when URL changes (e.g. user clicks a tag link on another page).
  // If the tag param matches a context tag, lift it into the dedicated
  // context-tag filter instead of treating it as a free-text query.
  useEffect(() => {
    const tagParam = searchParams.get("tag");
    const qParam = searchParams.get("q");
    const contextMatch = dbTags.some(
      (t) => t.category === "context" && t.name === tagParam,
    );
    if (tagParam && contextMatch) {
      setContextFilter(tagParam);
      setQuery("");
    } else {
      setQuery(qParam || tagParam || "");
      setContextFilter(null);
    }
  }, [searchParams, dbTags]);

  const toggleContextFilter = (name: string) => {
    setContextFilter((prev) => (prev === name ? null : name));
  };

  const results = useMemo(() => {
    const q = query.toLowerCase();
    const all = tipsQ.data ?? [];
    if (!q && !contextFilter) return [];
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
      return matchesQuery && matchesContext;
    });
  }, [tipsQ.data, query, contextFilter]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const next = new URLSearchParams(searchParams);
    next.delete("tag");
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
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleContextFilter(tag.name)}
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
                );
              })}
            </div>
          </div>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground mb-4">読み込み中…</p>
        )}
        {(query || contextFilter) && (
          <p className="text-sm text-muted-foreground mb-4">
            {query && `「${query}」`}
            {query && contextFilter && " × "}
            {contextFilter && `${contextFilter}`}
            の検索結果: {results.length}件
          </p>
        )}
        <div className="bg-card rounded-lg border divide-y">
          {results.map((tip) => (
            <div key={tip.id} className="px-4">
              <ContentCard data={tip} />
            </div>
          ))}
          {(query || contextFilter) && results.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-12">
              検索結果が見つかりませんでした
            </p>
          )}
          {!query && !contextFilter && (
            <p className="text-center text-muted-foreground py-12">
              キーワードまたはタグを選択してください
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
