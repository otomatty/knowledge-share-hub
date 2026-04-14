import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ContentCard } from "@/components/shared/ContentCard";
import {
  useProfileByUsername,
  useTipsMapped,
} from "@/hooks/use-domain-queries";

export default function UserProfile() {
  const { username } = useParams();
  const profileQ = useProfileByUsername(username);
  const tipsQ = useTipsMapped();

  const user = profileQ.data?.profile;
  const userId = profileQ.data?.userId;

  const userTips = useMemo(() => {
    if (!userId) return [];
    return (tipsQ.data ?? []).filter(
      (t) => t.author.id === userId && !t.is_anonymous,
    );
  }, [userId, tipsQ.data]);

  if (profileQ.isLoading || tipsQ.isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">読み込み中…</p>
      </MainLayout>
    );
  }

  if (profileQ.isError) {
    return (
      <MainLayout>
        <p className="text-destructive py-12">
          プロフィールの読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">ユーザーが見つかりません</p>
      </MainLayout>
    );
  }

  if (tipsQ.isError) {
    return (
      <MainLayout>
        <p className="text-destructive py-12">
          気づきの読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
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
                {user.display_name[0]}
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

        <h2 className="text-lg font-semibold mb-3">
          💬 気づき ({userTips.length})
        </h2>
        <div className="bg-card rounded-lg border divide-y">
          {userTips.map((t) => (
            <div key={t.id} className="px-4">
              <ContentCard data={t} />
            </div>
          ))}
          {userTips.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              まだ気づきがありません
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
