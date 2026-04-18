import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/shared/TagInput";
import { ContextTagPicker } from "@/components/shared/ContextTagPicker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useDailyPrompt } from "@/hooks/use-daily-prompt";
import { useTipByIdMapped } from "@/hooks/use-domain-queries";
import { useLinkTipAttemptResult } from "@/hooks/use-tip-attempts";
import type { Tag } from "@/types";
import { toast } from "sonner";
import { Repeat } from "lucide-react";

export default function TipNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const sourceTipId = searchParams.get("source") ?? undefined;

  // If ?source=<id> is present we render a "derived-from" banner and, on
  // submit, link the newly posted tip back to the source via tip_attempts.
  const { data: sourceTip } = useTipByIdMapped(sourceTipId);
  const linkAttempt = useLinkTipAttemptResult();

  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [contextTag, setContextTag] = useState<Tag | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dailyPrompt = useDailyPrompt();

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

    const allTagIds = Array.from(
      new Set([
        ...(contextTag ? [contextTag.id] : []),
        ...tags.map((t) => t.id),
      ]),
    );
    if (allTagIds.length > 0) {
      const { error: tagErr } = await supabase.from("tip_tags").insert(
        allTagIds.map((tagId) => ({ tip_id: tip.id, tag_id: tagId })),
      );
      if (tagErr) {
        toast.error("タグの保存に失敗しました");
        setSubmitting(false);
        return;
      }
    }

    // If this post is a "result of trying" another tip, link them together
    // and notify the source tip's author that their insight produced a result.
    if (sourceTipId && sourceTip) {
      try {
        await linkAttempt.mutateAsync({
          sourceTipId,
          userId: profile.id,
          resultTipId: tip.id,
        });

        // Best-effort notification to the source tip author — non-blocking.
        if (sourceTip.author.id !== profile.id) {
          const actorName = isAnonymous
            ? "名無しエンジニア"
            : profile.display_name;
          await supabase.from("notifications").insert({
            user_id: sourceTip.author.id,
            type: "try_it_result",
            content_type: "tip",
            content_id: tip.id,
            actor_id: profile.id,
            message: `${actorName}さんがあなたの気づきを試した結果を投稿しました`,
          });
        }
      } catch (linkErr) {
        // Don't fail the whole submission if the link-up hiccups — the tip is
        // already saved. Just surface the issue so the user can retry.
        console.error("Failed to link tip attempt:", linkErr);
        toast.error("派生元との紐付けに失敗しました");
      }
    }

    queryClient.invalidateQueries({ queryKey: ["tips"] });
    setSubmitting(false);
    toast.success(
      sourceTipId ? "試した結果を投稿しました" : "気づきを投稿しました",
    );
    navigate(sourceTipId ? `/tips/${sourceTipId}` : "/tips");
  };

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">
          {sourceTipId ? "🔁 試した結果を投稿する" : "💡 気づきを投稿する"}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {sourceTip && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Repeat className="h-3.5 w-3.5" />
                派生元の気づき
              </div>
              <Link
                to={`/tips/${sourceTip.id}`}
                className="block text-sm font-medium hover:text-primary"
              >
                {sourceTip.content.length > 80
                  ? `${sourceTip.content.slice(0, 80)}…`
                  : sourceTip.content}
              </Link>
              <p className="text-xs text-muted-foreground mt-1">
                by{" "}
                {sourceTip.is_anonymous
                  ? "名無しエンジニア"
                  : sourceTip.author.display_name}
              </p>
            </div>
          )}
          {!sourceTipId && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">今日のお題</p>
              <p className="text-sm font-medium">{dailyPrompt}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label>
              {sourceTipId
                ? "試してどうだった？（最大140文字）"
                : "気づき（最大140文字）"}
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 140))}
              placeholder={
                sourceTipId
                  ? "実際に試した結果・気づきを書こう"
                  : dailyPrompt
              }
              className="resize-none h-24"
              maxLength={140}
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.length}/140
            </p>
          </div>
          <div className="space-y-2">
            <Label>気づきの種類（任意・1つ選択）</Label>
            <ContextTagPicker value={contextTag} onChange={setContextTag} />
          </div>
          <div className="space-y-2">
            <Label>技術タグ</Label>
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
