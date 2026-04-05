import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";
import { Shield, Users, Hash } from "lucide-react";
import { useState } from "react";

export default function AdminPage() {
  const [tab, setTab] = useState("users");

  const usersQ = useQuery({
    queryKey: ["profiles", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const tagsQ = useQuery({
    queryKey: ["tags", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const users = usersQ.data ?? [];
  const tags = tagsQ.data ?? [];

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Shield className="h-6 w-6" /> 管理画面
        </h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="users" className="gap-1">
              <Users className="h-4 w-4" /> ユーザー管理
            </TabsTrigger>
            <TabsTrigger value="tags" className="gap-1">
              <Hash className="h-4 w-4" /> タグ管理
            </TabsTrigger>
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
                    {usersQ.isLoading && (
                      <tr>
                        <td colSpan={5} className="p-4 text-muted-foreground">
                          読み込み中…
                        </td>
                      </tr>
                    )}
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {user.display_name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.display_name}</p>
                              <p className="text-xs text-muted-foreground">
                                @{user.username}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{user.email}</td>
                        <td className="p-3">
                          <Badge
                            variant={
                              user.role === "admin" ? "default" : "secondary"
                            }
                          >
                            {user.role}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {user.created_at?.slice(0, 10)}
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm" disabled>
                            編集
                          </Button>
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
              {tagsQ.isLoading && (
                <p className="text-muted-foreground text-sm">読み込み中…</p>
              )}
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-1 border rounded-full px-3 py-1 text-sm"
                  >
                    <span>{tag.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive ml-1"
                      disabled
                    >
                      <span className="sr-only">削除</span>×
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
