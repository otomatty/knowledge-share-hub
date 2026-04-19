import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ContentCard } from "@/components/shared/ContentCard";
import { TipsDialog } from "@/components/shared/TipsDialog";
import { SelfResurfaceBanner } from "@/components/shared/SelfResurfaceBanner";
import { ResurfacedFeedSection } from "@/components/shared/ResurfacedFeedSection";
import { MessageSquarePlus } from "lucide-react";
import { useTipsMapped } from "@/hooks/use-domain-queries";
import {
  useFeedResurfacings,
  useSelfResurfacings,
} from "@/hooks/use-tip-resurfacings";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const [tipDialogOpen, setTipDialogOpen] = useState(false);
  const { profile } = useAuth();
  const tipsQ = useTipsMapped();
  const selfResurfQ = useSelfResurfacings(profile?.id);
  const feedResurfQ = useFeedResurfacings(profile?.id);

  if (tipsQ.isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12 text-center">読み込み中…</p>
      </MainLayout>
    );
  }

  if (tipsQ.isError) {
    return (
      <MainLayout>
        <p className="text-destructive py-12 text-center">
          気づきの読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      </MainLayout>
    );
  }

  const tips = tipsQ.data ?? [];
  const selfResurfacings = selfResurfQ.data ?? [];
  const feedResurfacings = feedResurfQ.data ?? [];

  return (
    <MainLayout>
      <section>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">気づきフィード</h1>
          <p className="text-sm text-muted-foreground mt-1">
            みんなの「ちょっとした気づき」を眺める場所
          </p>
        </div>

        <SelfResurfaceBanner items={selfResurfacings} />
        <ResurfacedFeedSection tips={feedResurfacings} />

        {tips.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            まだ気づきが投稿されていません
          </p>
        ) : (
          <div className="bg-card rounded-lg border">
            <div className="divide-y">
              {tips.map((tip) => (
                <div key={tip.id} className="px-4">
                  <ContentCard data={tip} />
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
