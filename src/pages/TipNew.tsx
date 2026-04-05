import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/shared/TagInput";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Tag } from "@/types";
import { toast } from "sonner";

export default function TipNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !profile) {
      toast.error("ログインが必要です");
      return;
    }
    setSubmitting(true);
    const { data: tip, error } = await supabase
      .from("tips")
      .insert({
        author_id: profile.id,
        content: content.trim(),
        is_anonymous: isAnonymous,
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !tip) {
      toast.error(error?.message ?? "投稿に失敗しました");
      setSubmitting(false);
      return;
    }

    for (const t of tags) {
      await supabase.from("tip_tags").insert({
        tip_id: tip.id,
        tag_id: t.id,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["tips"] });
    setSubmitting(false);
    toast.success("投稿しました");
    navigate("/tips");
  };

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">💬 Tips を投稿する</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>ひとこと（最大100文字）</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 100))}
              placeholder="今日ハマったこと、便利コマンド、ちょっとした気づきなど..."
              className="resize-none h-24"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.length}/100
            </p>
          </div>
          <div className="space-y-2">
            <Label>タグ</Label>
            <TagInput selectedTags={tags} onChange={setTags} />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
            <Label htmlFor="anonymous">匿名で投稿する</Label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!content.trim() || submitting}>
              {submitting ? "投稿中…" : "投稿する"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              キャンセル
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
