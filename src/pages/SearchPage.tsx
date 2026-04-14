import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { ContentCard } from "@/components/shared/ContentCard";
import { Search as SearchIcon } from "lucide-react";
import { useTipsMapped } from "@/hooks/use-domain-queries";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || searchParams.get("tag") || "";
  const [query, setQuery] = useState(initialQuery);

  const tipsQ = useTipsMapped();
  const loading = tipsQ.isLoading;

  const results = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return [];
    return (tipsQ.data ?? []).filter(
      (t) =>
        t.content.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.name.toLowerCase().includes(q)),
    );
  }, [tipsQ.data, query]);

  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-bold mb-4">気づきを探す</h1>
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
          {results.map((tip) => (
            <div key={tip.id} className="px-4">
              <ContentCard type="tip" data={tip} />
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
