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
import { useDailyPrompt } from "@/hooks/use-daily-prompt";
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
  const dailyPrompt = useDailyPrompt();

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

    // Issue #45: surface tag failures instead of swallowing them, and
    // run tech-tag inserts as awaited Promise.allSettled rather than
    // dispatching un-awaited inserts inside a for loop (which leaves
    // partial state on the first failure with no signal to the user).
    if (contextTag) {
      const { error: ctxErr } = await supabase.from("tip_tags").insert({
        tip_id: tip.id,
        tag_id: contextTag.id,
      });
      if (ctxErr) {
        toast.error("気づきの種類の保存に失敗しました");
      }
    }

    const techTagResults = await Promise.allSettled(
      selectedTags.map(async (name) => {
        let tagId = dbTags.find(
          (t) =>
            t.category === "tech" &&
            t.name.toLowerCase() === name.toLowerCase(),
        )?.id;
        if (!tagId) {
          const { data: created, error: createErr } = await supabase
            .from("tags")
            .insert({ name, category: "tech" })
            .select("id")
            .single();
          if (createErr) {
            // Race: another session may have created the same tag
            // between our useTags() snapshot and this insert. Fall
            // back to fetching the existing row before giving up so
            // the user's tip still gets the tag linked.
            const { data: existing } = await supabase
              .from("tags")
              .select("id")
              .eq("category", "tech")
              .ilike("name", name)
              .maybeSingle();
            if (!existing?.id) throw createErr;
            tagId = existing.id;
          } else {
            tagId = created?.id;
          }
        }
        if (!tagId) throw new Error(`Tag id missing for ${name}`);
        const { error: linkErr } = await supabase.from("tip_tags").insert({
          tip_id: tip.id,
          tag_id: tagId,
        });
        if (linkErr) throw linkErr;
      }),
    );
    const failedTags = techTagResults.filter((r) => r.status === "rejected");
    if (failedTags.length > 0) {
      toast.error(`${failedTags.length}件のタグ保存に失敗しました`);
    }

    queryClient.invalidateQueries({ queryKey: ["tips"] });
    // New tech tags may have been created above. Invalidate the tags
    // cache so subsequent tag lookups in the same session see them and
    // don't retry inserts that would now hit a unique violation.
    queryClient.invalidateQueries({ queryKey: ["tags"] });
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
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">今日のお題</p>
            <p className="text-sm font-medium">{dailyPrompt}</p>
          </div>
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 140))}
              placeholder={dailyPrompt}
              maxLength={140}
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
