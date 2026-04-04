import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { ContentCard } from '@/components/shared/ContentCard';
import { mockTips, mockArticles, mockMemos } from '@/lib/mock-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search as SearchIcon } from 'lucide-react';
import type { FeedItem } from '@/types';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || searchParams.get('tag') || '';
  const [query, setQuery] = useState(initialQuery);

  const q = query.toLowerCase();
  const results: FeedItem[] = [
    ...mockTips.filter(t => t.content.toLowerCase().includes(q) || t.tags.some(tag => tag.name.toLowerCase().includes(q)))
      .map(t => ({ type: 'tip' as const, data: t })),
    ...mockArticles.filter(a => a.title.toLowerCase().includes(q) || a.tags.some(tag => tag.name.toLowerCase().includes(q)))
      .map(a => ({ type: 'article' as const, data: a })),
    ...mockMemos.filter(m => m.title.toLowerCase().includes(q) || m.tags.some(tag => tag.name.toLowerCase().includes(q)))
      .map(m => ({ type: 'memo' as const, data: m })),
  ];

  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-bold mb-4">検索</h1>
        <div className="relative mb-6">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="キーワード、タグ、著者名で検索..." className="pl-10 h-12 text-base" />
        </div>
        {query && (
          <p className="text-sm text-muted-foreground mb-4">「{query}」の検索結果: {results.length}件</p>
        )}
        <div className="bg-card rounded-lg border divide-y">
          {results.map(item => (
            <div key={`${item.type}-${item.data.id}`} className="px-4">
              <ContentCard type={item.type} data={item.data} />
            </div>
          ))}
          {query && results.length === 0 && (
            <p className="text-center text-muted-foreground py-12">検索結果が見つかりませんでした</p>
          )}
          {!query && (
            <p className="text-center text-muted-foreground py-12">キーワードを入力して検索してください</p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
