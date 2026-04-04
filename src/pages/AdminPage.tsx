import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { mockUsers, mockTags } from '@/lib/mock-data';
import { Shield, Trash2, Users, Hash } from 'lucide-react';

export default function AdminPage() {
  const [tab, setTab] = useState('users');

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Shield className="h-6 w-6" /> 管理画面
        </h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="users" className="gap-1"><Users className="h-4 w-4" /> ユーザー管理</TabsTrigger>
            <TabsTrigger value="tags" className="gap-1"><Hash className="h-4 w-4" /> タグ管理</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <div className="bg-card rounded-lg border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">ユーザー</th>
                      <th className="text-left p-3 font-medium">メール</th>
                      <th className="text-left p-3 font-medium">ロール</th>
                      <th className="text-left p-3 font-medium">登録日</th>
                      <th className="text-right p-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mockUsers.map(user => (
                      <tr key={user.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">{user.display_name[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.display_name}</p>
                              <p className="text-xs text-muted-foreground">@{user.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{user.email}</td>
                        <td className="p-3">
                          <Badge variant={user.id === '1' ? 'default' : 'secondary'}>
                            {user.id === '1' ? 'admin' : 'user'}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{user.created_at}</td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm">編集</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tags">
            <div className="bg-card rounded-lg border p-4">
              <div className="flex flex-wrap gap-2">
                {mockTags.map(tag => (
                  <div key={tag.id} className="flex items-center gap-1 border rounded-full px-3 py-1 text-sm">
                    <span>{tag.name}</span>
                    <button className="text-muted-foreground hover:text-destructive ml-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
