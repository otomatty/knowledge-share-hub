import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TagInput } from "@/components/shared/TagInput";
import { useAuth } from "@/contexts/AuthContext";
import { useTags } from "@/hooks/use-supabase-query";
import { supabase } from "@/lib/supabase";
import type { Tag } from "@/types";
import { Camera } from "lucide-react";
import { toast } from "sonner";

export default function ProfileSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const { data: dbTags = [] } = useTags();
  const [form, setForm] = useState({
    display_name: "",
    current_project: "",
    bio: "",
  });
  const [skillTags, setSkillTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name,
      current_project: profile.current_project ?? "",
      bio: profile.bio ?? "",
    });
    setSkillTags(
      (profile.skill_tags ?? []).map((name) => {
        // Skill tags are always tech-category; match by name + category so a
        // context tag that happens to share a name can't reintroduce itself.
        const found = dbTags.find(
          (t) => t.name === name && t.category === "tech",
        );
        return found
          ? { id: found.id, name: found.name, category: "tech" as const }
          : { id: `local-${name}`, name, category: "tech" as const };
      }),
    );
  }, [profile, dbTags]);

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name,
        current_project: form.current_project || null,
        bio: form.bio || null,
        skill_tags: skillTags.map((t) => t.name),
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success("保存しました");
  };

  if (!profile) {
    return (
      <MainLayout showSidebar={false}>
        <p className="text-muted-foreground">読み込み中…</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">プロフィール設定</h1>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {form.display_name[0]}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 shadow"
              >
                <Camera className="h-3 w-3" />
              </button>
            </div>
            <div>
              <p className="font-medium">{form.display_name}</p>
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>表示名</Label>
            <Input
              value={form.display_name}
              onChange={(e) => update("display_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>現在の案件</Label>
            <Input
              value={form.current_project}
              onChange={(e) => update("current_project", e.target.value)}
              placeholder="例: 金融系Webアプリ開発"
            />
          </div>
          <div className="space-y-2">
            <Label>スキルタグ</Label>
            <TagInput
              selectedTags={skillTags}
              onChange={setSkillTags}
              placeholder="スキルを追加..."
            />
          </div>
          <div className="space-y-2">
            <Label>自己紹介（200文字以内）</Label>
            <Textarea
              value={form.bio}
              onChange={(e) => update("bio", e.target.value.slice(0, 200))}
              className="h-24 resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {form.bio.length}/200
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "保存中…" : "保存する"}
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              キャンセル
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
