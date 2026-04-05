import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CommentReactions } from "@/components/shared/CommentReactions";
import { TiptapEditor } from "@/components/shared/TiptapEditor";
import { useAuth } from "@/contexts/AuthContext";
import { useCommentsThread } from "@/hooks/use-domain-queries";
import { useCreateComment } from "@/hooks/use-supabase-query";
import type { Comment } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { MessageSquare, CornerDownRight } from "lucide-react";
import { toast } from "sonner";

interface CommentSectionProps {
  contentType: "memo" | "article";
  contentId: string;
}

function CommentItem({
  comment,
  isReply,
  contentType,
  contentId,
  onReply,
}: {
  comment: Comment;
  isReply?: boolean;
  contentType: "memo" | "article";
  contentId: string;
  onReply: (parentId: string, html: string) => void;
}) {
  const [showReplyEditor, setShowReplyEditor] = useState(false);
  const [replyContent, setReplyContent] = useState("");

  return (
    <div className={`${isReply ? "ml-8 pl-4 border-l-2" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {comment.author.display_name[0]}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{comment.author.display_name}</span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(comment.created_at), {
            locale: ja,
            addSuffix: true,
          })}
        </span>
      </div>
      <div
        className="text-sm leading-relaxed mb-2 prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: comment.content }}
      />
      <div className="flex items-center gap-2 mb-3">
        <CommentReactions commentId={comment.id} />
        {!isReply && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => setShowReplyEditor(!showReplyEditor)}
          >
            <CornerDownRight className="h-3 w-3" /> 返信
          </Button>
        )}
      </div>
      {showReplyEditor && (
        <div className="ml-8 mb-4 space-y-2">
          <TiptapEditor
            content={replyContent}
            onChange={setReplyContent}
            placeholder="返信を入力..."
            minimal
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onReply(comment.id, replyContent);
                setReplyContent("");
                setShowReplyEditor(false);
              }}
            >
              返信する
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowReplyEditor(false)}
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}
      {comment.replies?.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          isReply
          contentType={contentType}
          contentId={contentId}
          onReply={onReply}
        />
      ))}
    </div>
  );
}

export function CommentSection({ contentType, contentId }: CommentSectionProps) {
  const { profile } = useAuth();
  const { data: comments = [], isLoading } = useCommentsThread(
    contentType,
    contentId,
  );
  const createComment = useCreateComment();
  const [newComment, setNewComment] = useState("");

  const totalCount = (list: Comment[]): number => {
    let n = 0;
    for (const c of list) {
      n += 1;
      if (c.replies?.length) n += totalCount(c.replies);
    }
    return n;
  };

  const submit = async (html: string, parentId?: string) => {
    const trimmed = html.replace(/<[^>]*>/g, "").trim();
    if (!trimmed || !profile) {
      toast.error("ログインが必要です");
      return;
    }
    try {
      await createComment.mutateAsync({
        author_id: profile.id,
        content: html,
        content_type: contentType,
        content_id: contentId,
        parent_id: parentId ?? null,
      });
      setNewComment("");
    } catch {
      toast.error("コメントの投稿に失敗しました");
    }
  };

  const handleReply = (parentId: string, html: string) => {
    void submit(html, parentId);
  };

  return (
    <div className="space-y-6">
      <h3 className="flex items-center gap-2 font-semibold">
        <MessageSquare className="h-5 w-5" />
        コメント ({isLoading ? "…" : totalCount(comments)})
      </h3>

      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {profile?.display_name?.[0] ?? "?"}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">
            {profile?.display_name ?? "ユーザー"}
          </span>
        </div>
        <TiptapEditor
          content={newComment}
          onChange={setNewComment}
          placeholder="コメントを入力..."
          minimal
        />
        <Button
          size="sm"
          disabled={!profile || createComment.isPending}
          onClick={() => submit(newComment)}
        >
          コメントする
        </Button>
      </div>

      <div className="space-y-4 divide-y">
        {comments.map((comment) => (
          <div key={comment.id} className="pt-4 first:pt-0">
            <CommentItem
              comment={comment}
              contentType={contentType}
              contentId={contentId}
              onReply={handleReply}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
