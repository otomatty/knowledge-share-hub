import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { ContentCard } from "@/components/shared/ContentCard";
import { Search as SearchIcon } from "lucide-react";
import type { FeedItem } from "@/types";
import {
  useArticlesMapped,
  useMemosMapped,
  useTipsMapped,
} from "@/hooks/use-domain-queries";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || searchParams.get("tag") || "";
  const typeFilter = searchParams.get("type");
  const [query, setQuery] = useState(initialQuery);

  const tipsQ = useTipsMapped();
  const articlesQ = useArticlesMapped();
  const memosQ = useMemosMapped();

  const loading = tipsQ.isLoading || articlesQ.isLoading || memosQ.isLoading;

  const results: FeedItem[] = useMemo(() => {
    const q = query.toLowerCase();
    const tips = (tipsQ.data ?? []).filter(
      (t) =>
        t.content.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.name.toLowerCase().includes(q)),
    );
    const articles = (articlesQ.data ?? []).filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.tags.some((tag) => tag.name.toLowerCase().includes(q)),
    );
    const memos = (memosQ.data ?? []).filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.tags.some((tag) => tag.name.toLowerCase().includes(q)),
    );

    let items: FeedItem[] = [
      ...tips.map((t) => ({ type: "tip" as const, data: t })),
      ...articles.map((a) => ({ type: "article" as const, data: a })),
      ...memos.map((m) => ({ type: "memo" as const, data: m })),
    ];

    if (typeFilter === "article") {
      items = items.filter((i) => i.type === "article");
    } else if (typeFilter === "memo") {
      items = items.filter((i) => i.type === "memo");
    } else if (typeFilter === "book") {
      items = [];
    }

    return items;
  }, [tipsQ.data, articlesQ.data, memosQ.data, query, typeFilter]);

  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-bold mb-4">検索</h1>
        <div className="relative mb-6">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="キーワード、タグ、著者名で検索..."
            className="pl-10 h-12 text-base"
          />
        </div>
        {loading && (
          <p className="text-sm text-muted-foreground mb-4">読み込み中…</p>
        )}
        {query && (
          <p className="text-sm text-muted-foreground mb-4">
            「{query}」の検索結果: {results.length}件
          </p>
        )}
        <div className="bg-card rounded-lg border divide-y">
          {results.map((item) => (
            <div key={`${item.type}-${item.data.id}`} className="px-4">
              <ContentCard type={item.type} data={item.data} />
            </div>
          ))}
          {query && results.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-12">
              検索結果が見つかりませんでした
            </p>
          )}
          {!query && (
            <p className="text-center text-muted-foreground py-12">
              キーワードを入力して検索してください
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
