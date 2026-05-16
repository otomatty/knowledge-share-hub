import { useParams, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentCard } from "@/components/shared/ContentCard";
import { ArchiveSection } from "@/components/archive/ArchiveSection";
import {
  useProfileByUsername,
  useTipsByUser,
} from "@/hooks/use-domain-queries";
import { useAuth } from "@/contexts/AuthContext";

const VALID_TABS = ["tips", "archive"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function UserProfile() {
  const { username } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const profileQ = useProfileByUsername(username);
  // Derive ownership from the session `user.id`, not the fetched
  // `profile`. AuthContext sets `loading=false` as soon as the session
  // resolves but kicks off the profile fetch separately, so there's a
  // window where `profile` is null while the archive page has already
  // loaded. Falling through to the non-owner branch in that window
  // mounts `OwnTipsPane` (firing the global feed query) even when the
  // URL said `?tab=archive` — exactly the cost the archive tab was
  // meant to avoid.
  const { user: authUser } = useAuth();

  const user = profileQ.data?.profile;
  const userId = profileQ.data?.userId;
  const isSelf = !!authUser?.id && !!userId && authUser.id === userId;

  const rawTab = searchParams.get("tab");
  const tab: TabValue =
    rawTab === "archive" && isSelf ? "archive" : "tips";
  const setTab = (next: TabValue) => {
    const params = new URLSearchParams(searchParams);
    if (next === "tips") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

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
                {user.display_name?.[0]?.toUpperCase() ?? "?"}
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
          // Radix TabsContent doesn't mount inactive tabs by default, so
          // putting the feed query inside `OwnTipsPane` means an owner
          // on ?tab=archive never pays for `useTipsByUser` — the archive
          // is owner-scoped and stays lightweight.
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList>
              <TabsTrigger value="tips">💬 気づき</TabsTrigger>
              <TabsTrigger value="archive">📦 アーカイブ</TabsTrigger>
            </TabsList>
            <TabsContent value="tips">
              <OwnTipsPane userId={userId} />
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
          <OwnTipsPane userId={userId} showHeading />
        )}
      </div>
    </MainLayout>
  );
}

function OwnTipsPane({
  userId,
  showHeading = false,
}: {
  userId: string;
  showHeading?: boolean;
}) {
  // Issue #14: scope the fetch to this user server-side instead of
  // pulling the global feed and filtering on the client.
  const tipsQ = useTipsByUser(userId);
  const tips = tipsQ.data ?? [];

  const heading = showHeading ? (
    <h2 className="text-lg font-semibold mb-3">
      💬 気づき
      {!tipsQ.isLoading && !tipsQ.isError ? ` (${tips.length})` : ""}
    </h2>
  ) : null;

  if (tipsQ.isLoading) {
    return (
      <>
        {heading}
        <p className="text-muted-foreground py-8">気づきを読み込み中…</p>
      </>
    );
  }
  if (tipsQ.isError) {
    return (
      <>
        {heading}
        <p className="text-destructive py-8">
          気づきの読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      </>
    );
  }
  if (tips.length === 0) {
    return (
      <>
        {heading}
        <p className="text-center text-muted-foreground py-8">
          まだ気づきがありません
        </p>
      </>
    );
  }
  return (
    <>
      {heading}
      <div className="bg-card rounded-lg border divide-y">
        {tips.map((t) => (
          <div key={t.id} className="px-4">
            <ContentCard data={t} />
          </div>
        ))}
      </div>
    </>
  );
}
