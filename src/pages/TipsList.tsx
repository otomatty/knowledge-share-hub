import { MainLayout } from "@/components/layout/MainLayout";
import { ContentCard } from "@/components/shared/ContentCard";
import { useTipsMapped } from "@/hooks/use-domain-queries";

export default function TipsList() {
  const { data: tips = [], isLoading } = useTipsMapped();

  if (isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">読み込み中…</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-bold mb-4">💡 気づき</h1>
        <div className="bg-card rounded-lg border">
          <div className="divide-y">
            {tips.map((tip) => (
              <div key={tip.id} className="px-4">
                <ContentCard data={tip} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
