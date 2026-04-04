import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ReactionButtons } from './ReactionButtons';
import type { Tip, Memo, Article, ContentType, ReactionSummary } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ContentCardProps {
  type: ContentType;
  data: Tip | Memo | Article;
}

function getTypeLabel(type: ContentType) {
  switch (type) {
    case 'tip': return { label: 'Tips', color: 'bg-kh-green/10 text-kh-green' };
    case 'memo': return { label: 'メモ', color: 'bg-kh-orange/10 text-kh-orange' };
    case 'article': return { label: '記事', color: 'bg-kh-purple/10 text-kh-purple' };
  }
}

function getLink(type: ContentType, id: string) {
  switch (type) {
    case 'tip': return `/tips`;
    case 'memo': return `/memos/${id}`;
    case 'article': return `/articles/${id}`;
  }
}

export function ContentCard({ type, data }: ContentCardProps) {
  const typeInfo = getTypeLabel(type);
  const authorName = data.is_anonymous ? '名無しエンジニア' : data.author.display_name;
  const authorInitial = data.is_anonymous ? '匿' : data.author.display_name[0];
  const link = getLink(type, data.id);
  const timeAgo = formatDistanceToNow(new Date(data.created_at), { locale: ja, addSuffix: true });
  const isTip = type === 'tip';
  const commentCount = 'comment_count' in data ? (data as Memo | Article).comment_count : 0;

  return (
    <div className="border-b py-4 last:border-b-0">
      {/* Author row */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">{authorInitial}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{authorName}</span>
        <span className="text-xs text-muted-foreground">{timeAgo}</span>
        <Badge variant="secondary" className={`ml-auto text-[10px] px-2 py-0 ${typeInfo.color}`}>
          {typeInfo.label}
        </Badge>
      </div>

      {/* Content */}
      {isTip ? (
        <p className="text-sm leading-relaxed mb-2">{(data as Tip).content}</p>
      ) : (
        <Link to={link} className="block group">
          <h3 className="font-semibold text-base group-hover:text-primary transition-colors mb-1 line-clamp-2">
            {'title' in data ? (data as Memo | Article).title : ''}
          </h3>
        </Link>
      )}

      {/* Tags */}
      {data.tags.length > 0 && (
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {data.tags.map(tag => (
            <Link key={tag.id} to={`/search?tag=${tag.name}`}>
              <Badge variant="secondary" className="text-xs hover:bg-primary/10">{tag.name}</Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Reactions + comments */}
      <div className="flex items-center gap-3">
        <ReactionButtons reactions={data.reactions} size="sm" />
        {!isTip && commentCount > 0 && (
          <Link to={link} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            {commentCount}
          </Link>
        )}
      </div>
    </div>
  );
}
