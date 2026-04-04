import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ReactionButtons } from './ReactionButtons';
import { TiptapEditor } from './TiptapEditor';
import { mockComments, currentUser } from '@/lib/mock-data';
import type { Comment } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { MessageSquare, CornerDownRight } from 'lucide-react';

interface CommentSectionProps {
  contentType: 'memo' | 'article';
  contentId: string;
}

function CommentItem({ comment, isReply }: { comment: Comment; isReply?: boolean }) {
  const [showReplyEditor, setShowReplyEditor] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  return (
    <div className={`${isReply ? 'ml-8 pl-4 border-l-2' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">{comment.author.display_name[0]}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{comment.author.display_name}</span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(comment.created_at), { locale: ja, addSuffix: true })}
        </span>
      </div>
      <div className="text-sm leading-relaxed mb-2 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: comment.content }} />
      <div className="flex items-center gap-2 mb-3">
        <ReactionButtons reactions={comment.reactions} size="sm" />
        {!isReply && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setShowReplyEditor(!showReplyEditor)}>
            <CornerDownRight className="h-3 w-3" /> 返信
          </Button>
        )}
      </div>
      {showReplyEditor && (
        <div className="ml-8 mb-4 space-y-2">
          <TiptapEditor content={replyContent} onChange={setReplyContent} placeholder="返信を入力..." minimal />
          <div className="flex gap-2">
            <Button size="sm">返信する</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowReplyEditor(false)}>キャンセル</Button>
          </div>
        </div>
      )}
      {comment.replies?.map(reply => <CommentItem key={reply.id} comment={reply} isReply />)}
    </div>
  );
}

export function CommentSection({ contentType, contentId }: CommentSectionProps) {
  const comments = mockComments.filter(c => c.content_type === contentType && c.content_id === contentId);
  const [newComment, setNewComment] = useState('');

  return (
    <div className="space-y-6">
      <h3 className="flex items-center gap-2 font-semibold">
        <MessageSquare className="h-5 w-5" />
        コメント ({comments.length})
      </h3>

      {/* New comment editor */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">{currentUser.display_name[0]}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{currentUser.display_name}</span>
        </div>
        <TiptapEditor content={newComment} onChange={setNewComment} placeholder="コメントを入力..." minimal />
        <Button size="sm">コメントする</Button>
      </div>

      {/* Comment list */}
      <div className="space-y-4 divide-y">
        {comments.map(comment => (
          <div key={comment.id} className="pt-4 first:pt-0">
            <CommentItem comment={comment} />
          </div>
        ))}
      </div>
    </div>
  );
}
