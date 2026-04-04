import { MainLayout } from '@/components/layout/MainLayout';
import { ContentCard } from '@/components/shared/ContentCard';
import { mockTips } from '@/lib/mock-data';

export default function TipsList() {
  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-bold mb-4">💬 Tips</h1>
        <div className="bg-card rounded-lg border">
          <div className="divide-y">
            {mockTips.map(tip => (
              <div key={tip.id} className="px-4">
                <ContentCard type="tip" data={tip} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
