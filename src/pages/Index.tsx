import { useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ContentCard } from "@/components/shared/ContentCard";
import { TipsDialog } from "@/components/shared/TipsDialog";
import { SelfResurfaceBanner } from "@/components/shared/SelfResurfaceBanner";
import { ResurfacedFeedSection } from "@/components/shared/ResurfacedFeedSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquarePlus } from "lucide-react";
import { useTipsMapped } from "@/hooks/use-domain-queries";
import {
  useFeedResurfacings,
  useSelfResurfacings,
} from "@/hooks/use-tip-resurfacings";
import { useTipsFollowedByTags } from "@/hooks/use-tag-follows";
import { useAuth } from "@/contexts/AuthContext";

type FeedTab = "all" | "followed";

export default function Index() {
  const [tipDialogOpen, setTipDialogOpen] = useState(false);
  const [tab, setTab] = useState<FeedTab>("all");
  const { profile } = useAuth();
  const tipsQ = useTipsMapped();
  // Defer the (heavier) followed-tags query until the user actually
  // opens the tab. `useTipsFollowedByTags` disables itself when the
  // userId arg is undefined, so this becomes a no-op on first load
  // for users who never switch to "フォロー中".
  const followedQ = useTipsFollowedByTags(
    tab === "followed" ? profile?.id : undefined,
  );
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
  const followedTips = followedQ.data ?? [];
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

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as FeedTab)}
          className="mb-3"
        >
          <TabsList>
            <TabsTrigger value="all">すべて</TabsTrigger>
            <TabsTrigger value="followed">フォロー中</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
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
          </TabsContent>

          <TabsContent value="followed" className="mt-3">
            {followedQ.isLoading ? (
              <p className="text-center text-muted-foreground py-12">
                読み込み中…
              </p>
            ) : followedTips.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                フォロー中のタグがまだありません。
                <Link to="/search" className="text-primary hover:underline ml-1">
                  検索画面
                </Link>
                からタグをフォローしましょう。
              </p>
            ) : (
              <div className="bg-card rounded-lg border">
                <div className="divide-y">
                  {followedTips.map((tip) => (
                    <div key={tip.id} className="px-4">
                      <ContentCard data={tip} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
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
