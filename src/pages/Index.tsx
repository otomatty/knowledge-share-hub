import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ContentCard } from '@/components/shared/ContentCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockTips, mockMemos, mockArticles } from '@/lib/mock-data';
import type { FeedItem } from '@/types';

const allFeedItems: FeedItem[] = [
  ...mockTips.map(t => ({ type: 'tip' as const, data: t })),
  ...mockMemos.map(m => ({ type: 'memo' as const, data: m })),
  ...mockArticles.map(a => ({ type: 'article' as const, data: a })),
].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime());

const trendItems = [...allFeedItems].sort((a, b) => {
  const scoreA = Object.values(a.data.reactions).reduce((s, v) => s + v, 0);
  const scoreB = Object.values(b.data.reactions).reduce((s, v) => s + v, 0);
  const ageA = (Date.now() - new Date(a.data.created_at).getTime()) / 3600000;
  const ageB = (Date.now() - new Date(b.data.created_at).getTime()) / 3600000;
  return (scoreB / Math.pow(ageB + 2, 1.5)) - (scoreA / Math.pow(ageA + 2, 1.5));
});

export default function Index() {
  const [tab, setTab] = useState('trend');

  const getItems = () => {
    switch (tab) {
      case 'trend': return trendItems;
      case 'new': return allFeedItems;
      case 'tips': return allFeedItems.filter(i => i.type === 'tip');
      case 'memos': return allFeedItems.filter(i => i.type === 'memo');
      case 'articles': return allFeedItems.filter(i => i.type === 'article');
      default: return allFeedItems;
    }
  };

  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-bold mb-4">フィード</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="trend">🔥 トレンド</TabsTrigger>
            <TabsTrigger value="new">🆕 新着</TabsTrigger>
            <TabsTrigger value="tips">💬 Tips</TabsTrigger>
            <TabsTrigger value="memos">📝 メモ</TabsTrigger>
            <TabsTrigger value="articles">📄 記事</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <div className="bg-card rounded-lg border">
              <div className="divide-y">
                {getItems().map(item => (
                  <div key={`${item.type}-${item.data.id}`} className="px-4">
                    <ContentCard type={item.type} data={item.data} />
                  </div>
                ))}
              </div>
              {getItems().length === 0 && (
                <p className="text-center text-muted-foreground py-12">まだ投稿がありません</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
