import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentCard } from "@/components/shared/ContentCard";
import { ArchiveSection } from "@/components/archive/ArchiveSection";
import {
  useProfileByUsername,
  useTipsMapped,
} from "@/hooks/use-domain-queries";
import { useAuth } from "@/contexts/AuthContext";

const VALID_TABS = ["tips", "archive"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function UserProfile() {
  const { username } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const profileQ = useProfileByUsername(username);
  const tipsQ = useTipsMapped();
  const { profile: currentProfile } = useAuth();

  const user = profileQ.data?.profile;
  const userId = profileQ.data?.userId;
  const isSelf = !!currentProfile && !!userId && currentProfile.id === userId;

  const rawTab = searchParams.get("tab");
  const tab: TabValue =
    rawTab === "archive" && isSelf ? "archive" : "tips";
  const setTab = (next: TabValue) => {
    const params = new URLSearchParams(searchParams);
    if (next === "tips") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const userTips = useMemo(() => {
    if (!userId) return [];
    return (tipsQ.data ?? []).filter(
      (t) => t.author.id === userId && !t.is_anonymous,
    );
  }, [userId, tipsQ.data]);

  // Only profileQ guards the entire page render; tipsQ is scoped to the
  // tips section below so a tips failure doesn't blank out the profile.
  if (profileQ.isError) {
    return (
      <MainLayout>
        <p className="text-destructive py-12">
          プロフィールの読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      </MainLayout>
    );
  }

  if (profileQ.isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">読み込み中…</p>
      </MainLayout>
    );
  }

  if (!user || !userId) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">ユーザーが見つかりません</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div>
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-xl">
                {user.display_name[0] ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-bold">{user.display_name}</h1>
              <p className="text-sm text-muted-foreground mb-2">@{user.username}</p>
              {user.current_project && (
                <p className="text-sm mb-2">📋 {user.current_project}</p>
              )}
              {user.bio && (
                <p className="text-sm text-muted-foreground mb-3">{user.bio}</p>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {user.skill_tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isSelf ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList>
              <TabsTrigger value="tips">💬 気づき</TabsTrigger>
              <TabsTrigger value="archive">📦 アーカイブ</TabsTrigger>
            </TabsList>
            <TabsContent value="tips">
              <TipsPane
                isLoading={tipsQ.isLoading}
                isError={tipsQ.isError}
                tips={userTips}
              />
            </TabsContent>
            <TabsContent value="archive">
              <ArchiveSection
                userId={userId}
                owner={{
                  id: user.id,
                  username: user.username,
                  display_name: user.display_name,
                }}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-3">
              💬 気づき
              {!tipsQ.isLoading && !tipsQ.isError ? ` (${userTips.length})` : ""}
            </h2>
            <TipsPane
              isLoading={tipsQ.isLoading}
              isError={tipsQ.isError}
              tips={userTips}
            />
          </>
        )}
      </div>
    </MainLayout>
  );
}

function TipsPane({
  isLoading,
  isError,
  tips,
}: {
  isLoading: boolean;
  isError: boolean;
  tips: ReturnType<typeof useTipsMapped>["data"] extends infer T
    ? T extends (infer U)[] | undefined
      ? U[]
      : never
    : never;
}) {
  if (isLoading) {
    return <p className="text-muted-foreground py-8">気づきを読み込み中…</p>;
  }
  if (isError) {
    return (
      <p className="text-destructive py-8">
        気づきの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }
  if (tips.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        まだ気づきがありません
      </p>
    );
  }
  return (
    <div className="bg-card rounded-lg border divide-y">
      {tips.map((t) => (
        <div key={t.id} className="px-4">
          <ContentCard data={t} />
        </div>
      ))}
    </div>
  );
}
