import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentCard } from "@/components/shared/ContentCard";
import {
  useArticlesMapped,
  useMemosMapped,
  useProfileByUsername,
  useTipsMapped,
} from "@/hooks/use-domain-queries";

export default function UserProfile() {
  const { username } = useParams();
  const [tab, setTab] = useState("articles");
  const profileQ = useProfileByUsername(username);
  const tipsQ = useTipsMapped();
  const articlesQ = useArticlesMapped();
  const memosQ = useMemosMapped();

  const user = profileQ.data?.profile;
  const userId = profileQ.data?.userId;

  const { userTips, userArticles, userMemos } = useMemo(() => {
    if (!userId) {
      return { userTips: [], userArticles: [], userMemos: [] };
    }
    return {
      userTips: (tipsQ.data ?? []).filter(
        (t) => t.author.id === userId && !t.is_anonymous,
      ),
      userArticles: (articlesQ.data ?? []).filter(
        (a) => a.author.id === userId && !a.is_anonymous,
      ),
      userMemos: (memosQ.data ?? []).filter(
        (m) => m.author.id === userId && !m.is_anonymous,
      ),
    };
  }, [userId, tipsQ.data, articlesQ.data, memosQ.data]);

  if (profileQ.isLoading || tipsQ.isLoading || articlesQ.isLoading || memosQ.isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">読み込み中…</p>
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

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="articles">
              📄 記事 ({userArticles.length})
            </TabsTrigger>
            <TabsTrigger value="memos">📝 メモ ({userMemos.length})</TabsTrigger>
            <TabsTrigger value="tips">💬 Tips ({userTips.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="articles">
            <div className="bg-card rounded-lg border divide-y">
              {userArticles.map((a) => (
                <div key={a.id} className="px-4">
                  <ContentCard type="article" data={a} />
                </div>
              ))}
              {userArticles.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  記事がありません
                </p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="memos">
            <div className="bg-card rounded-lg border divide-y">
              {userMemos.map((m) => (
                <div key={m.id} className="px-4">
                  <ContentCard type="memo" data={m} />
                </div>
              ))}
              {userMemos.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  メモがありません
                </p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="tips">
            <div className="bg-card rounded-lg border divide-y">
              {userTips.map((t) => (
                <div key={t.id} className="px-4">
                  <ContentCard type="tip" data={t} />
                </div>
              ))}
              {userTips.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Tipsがありません
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
