import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/shared/TagInput";
import { TiptapEditor } from "@/components/shared/TiptapEditor";
import { useArticleByIdMapped } from "@/hooks/use-domain-queries";
import { supabase } from "@/lib/supabase";
import type { Tag } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ArticleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: article, isLoading } = useArticleByIdMapped(id);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setContent(article.content);
      setTags(article.tags);
      setIsAnonymous(article.is_anonymous);
    }
  }, [article]);

  const save = async (status: "draft" | "published") => {
    if (!id || !article) return;
    setSaving(true);
    const { error: upErr } = await supabase
      .from("articles")
      .update({
        title,
        content,
        is_anonymous: isAnonymous,
        status,
        published_at:
          status === "published"
            ? article.published_at ?? new Date().toISOString()
            : null,
      })
      .eq("id", id);
    if (upErr) {
      toast.error(upErr.message);
      setSaving(false);
      return;
    }

    await supabase.from("article_tags").delete().eq("article_id", id);
    for (const t of tags) {
      await supabase.from("article_tags").insert({
        article_id: id,
        tag_id: t.id,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["articles"] });
    queryClient.invalidateQueries({ queryKey: ["articles", "domain", id] });
    setSaving(false);
    toast.success("保存しました");
    navigate(`/articles/${id}`);
  };

  if (isLoading || !article) {
    return (
      <MainLayout showSidebar={false}>
        <p className="text-muted-foreground">読み込み中…</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">📄 記事を編集</h1>
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="text-xl font-semibold h-12"
          />
          <div className="space-y-2">
            <Label>タグ</Label>
            <TagInput selectedTags={tags} onChange={setTags} />
          </div>
          <TiptapEditor content={content} onChange={setContent} />
          <div className="flex items-center gap-2">
            <Switch
              id="anon"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
            <Label htmlFor="anon">匿名で投稿する</Label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              キャンセル
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => void save("draft")}
            >
              下書き保存
            </Button>
            <Button disabled={saving} onClick={() => void save("published")}>
              更新する
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
