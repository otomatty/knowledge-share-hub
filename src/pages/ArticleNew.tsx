import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/shared/TagInput";
import { TiptapEditor } from "@/components/shared/TiptapEditor";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Tag } from "@/types";
import { toast } from "sonner";

export default function ArticleNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (status: "draft" | "published") => {
    if (!title.trim() || !profile) {
      toast.error("タイトルを入力するか、ログインしてください");
      return;
    }
    setSaving(true);
    const published = status === "published";
    const { data: row, error } = await supabase
      .from("articles")
      .insert({
        author_id: profile.id,
        title: title.trim(),
        content,
        is_anonymous: isAnonymous,
        status,
        published_at: published ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error || !row) {
      toast.error(error?.message ?? "保存に失敗しました");
      setSaving(false);
      return;
    }

    for (const t of tags) {
      await supabase.from("article_tags").insert({
        article_id: row.id,
        tag_id: t.id,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["articles"] });
    queryClient.invalidateQueries({ queryKey: ["articles", "domain"] });
    setSaving(false);
    toast.success(published ? "公開しました" : "下書きを保存しました");
    navigate(`/articles/${row.id}`);
  };

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">📄 記事を作成</h1>
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
          <TiptapEditor
            content={content}
            onChange={setContent}
            placeholder="記事の本文を入力..."
          />
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
              disabled={!title.trim() || saving}
              onClick={() => void save("draft")}
            >
              下書き保存
            </Button>
            <Button
              disabled={!title.trim() || saving}
              onClick={() => void save("published")}
            >
              公開する
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
