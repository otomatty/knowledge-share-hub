import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ContextTagPicker } from "@/components/shared/ContextTagPicker";
import { useAuth } from "@/contexts/AuthContext";
import { useTags } from "@/hooks/use-supabase-query";
import { supabase } from "@/lib/supabase";
import type { Tag } from "@/types";
import { toast } from "sonner";

interface TipsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TipsDialog({ open, onOpenChange }: TipsDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: dbTags = [] } = useTags();
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [contextTag, setContextTag] = useState<Tag | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName],
    );
  };

  const handleSubmit = async () => {
    if (!content.trim() || !profile) {
      toast.error("ログインが必要です");
      return;
    }
    setSubmitting(true);
    const { data: tip, error: tipErr } = await supabase
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

    if (tipErr || !tip) {
      toast.error(tipErr?.message ?? "投稿に失敗しました");
      setSubmitting(false);
      return;
    }

    if (contextTag) {
      const { error: ctxErr } = await supabase.from("tip_tags").insert({
        tip_id: tip.id,
        tag_id: contextTag.id,
      });
      if (ctxErr) {
        console.error("Failed to insert context tag:", ctxErr);
      }
    }

    for (const name of selectedTags) {
      let tagId = dbTags.find(
        (t) =>
          t.category === "tech" &&
          t.name.toLowerCase() === name.toLowerCase(),
      )?.id;
      if (!tagId) {
        const { data: created } = await supabase
          .from("tags")
          .insert({ name, category: "tech" })
          .select()
          .single();
        tagId = created?.id;
      }
      if (tagId) {
        await supabase.from("tip_tags").insert({
          tip_id: tip.id,
          tag_id: tagId,
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["tips"] });
    setContent("");
    setSelectedTags([]);
    setContextTag(null);
    setIsAnonymous(false);
    setSubmitting(false);
    onOpenChange(false);
    toast.success("気づきを投稿しました");
  };

  const remaining = 140 - content.length;
  const tagChoices = dbTags.filter((t) => t.category === "tech").slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">💡 気づきを投稿</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 140))}
              placeholder="今日、何に気づいた？ どんな違和感を感じた？"
              className="w-full min-h-[120px] resize-none rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <span
              className={`absolute bottom-2 right-3 text-xs ${remaining < 20 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {remaining}
            </span>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">
              気づきの種類（任意・1つ選択）
            </p>
            <ContextTagPicker value={contextTag} onChange={setContextTag} />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">技術タグ（任意）</p>
            <div className="flex flex-wrap gap-1.5">
              {tagChoices.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={
                    selectedTags.includes(tag.name) ? "default" : "secondary"
                  }
                  className="cursor-pointer text-xs"
                  onClick={() => toggleTag(tag.name)}
                >
                  {tag.name}
                  {selectedTags.includes(tag.name) && (
                    <X className="h-3 w-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded border-muted-foreground"
            />
            匿名で投稿する
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={!content.trim() || submitting}
            >
              {submitting ? "投稿中…" : "投稿する"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
