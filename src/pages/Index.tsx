import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ContentCard } from "@/components/shared/ContentCard";
import { TipsDialog } from "@/components/shared/TipsDialog";
import { MessageSquarePlus } from "lucide-react";
import { useTipsMapped } from "@/hooks/use-domain-queries";

export default function Index() {
  const [tipDialogOpen, setTipDialogOpen] = useState(false);
  const tipsQ = useTipsMapped();

  if (tipsQ.isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12 text-center">読み込み中…</p>
      </MainLayout>
    );
  }

  const tips = tipsQ.data ?? [];

  return (
    <MainLayout>
      <section>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">気づきフィード</h1>
          <p className="text-sm text-muted-foreground mt-1">
            みんなの「ちょっとした気づき」を眺める場所
          </p>
        </div>

        {tips.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            まだ気づきが投稿されていません
          </p>
        ) : (
          <div className="bg-card rounded-lg border">
            <div className="divide-y">
              {tips.map((tip) => (
                <div key={tip.id} className="px-4">
                  <ContentCard type="tip" data={tip} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setTipDialogOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
        aria-label="気づきを投稿"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>
      <TipsDialog open={tipDialogOpen} onOpenChange={setTipDialogOpen} />
    </MainLayout>
  );
}
