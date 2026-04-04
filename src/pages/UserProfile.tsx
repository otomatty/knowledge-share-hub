import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentCard } from '@/components/shared/ContentCard';
import { mockUsers, mockTips, mockArticles, mockMemos } from '@/lib/mock-data';

export default function UserProfile() {
  const { username } = useParams();
  const user = mockUsers.find(u => u.username === username) || mockUsers[0];
  const [tab, setTab] = useState('articles');

  const userTips = mockTips.filter(t => t.author.id === user.id && !t.is_anonymous);
  const userArticles = mockArticles.filter(a => a.author.id === user.id && !a.is_anonymous);
  const userMemos = mockMemos.filter(m => m.author.id === user.id && !m.is_anonymous);

  return (
    <MainLayout>
      <div>
        {/* Profile header */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-xl">{user.display_name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-bold">{user.display_name}</h1>
              <p className="text-sm text-muted-foreground mb-2">@{user.username}</p>
              {user.current_project && <p className="text-sm mb-2">📋 {user.current_project}</p>}
              {user.bio && <p className="text-sm text-muted-foreground mb-3">{user.bio}</p>}
              <div className="flex gap-1.5 flex-wrap">
                {user.skill_tags.map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
              </div>
            </div>
          </div>
        </div>

        {/* Content tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="articles">📄 記事 ({userArticles.length})</TabsTrigger>
            <TabsTrigger value="memos">📝 メモ ({userMemos.length})</TabsTrigger>
            <TabsTrigger value="tips">💬 Tips ({userTips.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="articles">
            <div className="bg-card rounded-lg border divide-y">
              {userArticles.map(a => <div key={a.id} className="px-4"><ContentCard type="article" data={a} /></div>)}
              {userArticles.length === 0 && <p className="text-center text-muted-foreground py-8">記事がありません</p>}
            </div>
          </TabsContent>
          <TabsContent value="memos">
            <div className="bg-card rounded-lg border divide-y">
              {userMemos.map(m => <div key={m.id} className="px-4"><ContentCard type="memo" data={m} /></div>)}
              {userMemos.length === 0 && <p className="text-center text-muted-foreground py-8">メモがありません</p>}
            </div>
          </TabsContent>
          <TabsContent value="tips">
            <div className="bg-card rounded-lg border divide-y">
              {userTips.map(t => <div key={t.id} className="px-4"><ContentCard type="tip" data={t} /></div>)}
              {userTips.length === 0 && <p className="text-center text-muted-foreground py-8">Tipsがありません</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
