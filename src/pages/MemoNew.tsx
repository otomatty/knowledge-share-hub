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

export default function MemoNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [firstEntry, setFirstEntry] = useState("");
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
    const { data: memo, error } = await supabase
      .from("memos")
      .insert({
        author_id: profile.id,
        title: title.trim(),
        is_anonymous: isAnonymous,
        status,
        published_at: published ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error || !memo) {
      toast.error(error?.message ?? "保存に失敗しました");
      setSaving(false);
      return;
    }

    const { error: entryErr } = await supabase.from("memo_entries").insert({
      memo_id: memo.id,
      content: firstEntry,
      sort_order: 0,
    });
    if (entryErr) {
      await supabase.from("memos").delete().eq("id", memo.id);
      toast.error(entryErr.message);
      setSaving(false);
      return;
    }

    for (const t of tags) {
      await supabase.from("memo_tags").insert({
        memo_id: memo.id,
        tag_id: t.id,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["memos"] });
    queryClient.invalidateQueries({ queryKey: ["memos", "domain"] });
    setSaving(false);
    toast.success(published ? "公開しました" : "下書きを保存しました");
    navigate(`/memos/${memo.id}`);
  };

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">📝 メモを作成</h1>
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="メモのタイトル"
            className="text-xl font-semibold h-12"
          />
          <div className="space-y-2">
            <Label>タグ</Label>
            <TagInput selectedTags={tags} onChange={setTags} />
          </div>
          <div className="space-y-2">
            <Label>最初のエントリ</Label>
            <TiptapEditor
              content={firstEntry}
              onChange={setFirstEntry}
              placeholder="調査メモ、作業ログなどを記入..."
            />
          </div>
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
