import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useArticlesMapped } from "@/hooks/use-domain-queries";
import { GripVertical, Plus, X, ImageIcon } from "lucide-react";

export default function BookNew() {
  const navigate = useNavigate();
  const { data: articles = [], isLoading } = useArticlesMapped();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);

  const availableArticles = articles.filter((a) => !selectedArticles.includes(a.id));

  if (isLoading) {
    return (
      <MainLayout showSidebar={false}>
        <p className="text-muted-foreground">読み込み中…</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">📚 ブックを作成</h1>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>タイトル</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ブックのタイトル"
              className="text-xl h-12"
            />
          </div>
          <div className="space-y-2">
            <Label>説明</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ブックの説明文..."
              className="h-20 resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label>カバー画像</Label>
            <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground hover:border-primary/50 cursor-pointer">
              <ImageIcon className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">クリックして画像をアップロード</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>章立て（記事の追加）</Label>
            {selectedArticles.length > 0 && (
              <div className="space-y-2">
                {selectedArticles.map((articleId, i) => {
                  const article = articles.find((a) => a.id === articleId);
                  if (!article) return null;
                  return (
                    <Card key={articleId}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        <span className="text-sm text-muted-foreground w-6">
                          {i + 1}.
                        </span>
                        <span className="text-sm font-medium flex-1">
                          {article.title}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setSelectedArticles((prev) =>
                              prev.filter((id) => id !== articleId),
                            )
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            {availableArticles.length > 0 && (
              <div className="border rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground mb-2">記事を追加:</p>
                {availableArticles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    className="w-full text-left text-sm p-2 hover:bg-muted rounded flex items-center gap-2"
                    onClick={() =>
                      setSelectedArticles((prev) => [...prev, article.id])
                    }
                  >
                    <Plus className="h-3 w-3" />
                    {article.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              キャンセル
            </Button>
            <Button variant="secondary" disabled>
              下書き保存
            </Button>
            <Button disabled={!title.trim() || selectedArticles.length === 0}>
              公開する
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
