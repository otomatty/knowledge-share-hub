import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { ZennArticleCard } from '@/components/shared/ZennArticleCard';
import { ZennBookCard } from '@/components/shared/ZennBookCard';
import { TipsDialog } from '@/components/shared/TipsDialog';
import { ChevronRight, MessageSquarePlus } from 'lucide-react';
import { mockTips, mockMemos, mockArticles, mockBooks } from '@/lib/mock-data';
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

function SectionHeader({ title, tooltip }: { title: string; tooltip?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">{title}</h2>
        {tooltip && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{tooltip}</span>
        )}
      </div>
    </div>
  );
}

function SectionFooter({ linkTo, linkLabel }: { linkTo: string; linkLabel: string }) {
  return (
    <div className="mt-6 text-center">
      <Link
        to={linkTo}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {linkLabel}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ArticleGrid({ items }: { items: FeedItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
      {items.map(item => (
        <div key={`${item.type}-${item.data.id}`} className="border-b last:border-b-0">
          <ZennArticleCard type={item.type} data={item.data} />
        </div>
      ))}
    </div>
  );
}

export default function Index() {
  const [tipDialogOpen, setTipDialogOpen] = useState(false);

  const tipItems = allFeedItems.filter(i => i.type === 'tip');
  const articleItems = allFeedItems.filter(i => i.type === 'article');
  const memoItems = allFeedItems.filter(i => i.type === 'memo');

  return (
    <MainLayout showSidebar={false}>
      {/* Tips section */}
      <section className="mb-12">
        <SectionHeader title="Tips" tooltip="ひとこと知見の共有" />
        <ArticleGrid items={tipItems} />
        <SectionFooter linkTo="/tips" linkLabel="Tipsをもっと見る" />
      </section>

      {/* Articles section */}
      <section className="mb-12">
        <SectionHeader title="Articles" tooltip="技術記事" />
        <ArticleGrid items={articleItems} />
        <SectionFooter linkTo="/search?type=article" linkLabel="記事をもっと見る" />
      </section>

      {/* Books section - horizontal scroll */}
      {mockBooks.length > 0 && (
        <section className="mb-12">
          <SectionHeader title="Books" />
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {mockBooks.map(book => (
              <ZennBookCard key={book.id} book={book} />
            ))}
          </div>
          <SectionFooter linkTo="/search?type=book" linkLabel="ブックストアで本を探す" />
        </section>
      )}

      {/* Memos section */}
      <section className="mb-12">
        <SectionHeader title="Memos" tooltip="学習・調査メモ" />
        <ArticleGrid items={memoItems} />
        <SectionFooter linkTo="/search?type=memo" linkLabel="メモをもっと見る" />
      </section>

      {/* Featured / Trending section */}
      <section className="mb-12">
        <SectionHeader title="Featured" />
        <ArticleGrid items={trendItems.slice(0, 10)} />
        <SectionFooter linkTo="/search" linkLabel="トレンドをもっと見る" />
      </section>

      {/* Tips FAB + Dialog */}
      <button
        onClick={() => setTipDialogOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
        aria-label="Tipsを投稿"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>
      <TipsDialog open={tipDialogOpen} onOpenChange={setTipDialogOpen} />
    </MainLayout>
  );
}
