import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Heart } from 'lucide-react';
import type { Tip, Memo, Article, ContentType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ZennArticleCardProps {
  type: ContentType;
  data: Tip | Memo | Article;
}

const TYPE_EMOJI: Record<ContentType, string> = {
  tip: '💬',
  memo: '📝',
  article: '📄',
};

function getLink(type: ContentType, id: string) {
  switch (type) {
    case 'tip': return `/tips`;
    case 'memo': return `/memos/${id}`;
    case 'article': return `/articles/${id}`;
  }
}

function getTitle(type: ContentType, data: Tip | Memo | Article): string {
  if (type === 'tip') return (data as Tip).content;
  return (data as Memo | Article).title;
}

function getTotalLikes(data: Tip | Memo | Article): number {
  return Object.values(data.reactions).reduce((s, v) => s + v, 0);
}

export function ZennArticleCard({ type, data }: ZennArticleCardProps) {
  const link = getLink(type, data.id);
  const title = getTitle(type, data);
  const authorName = data.is_anonymous ? '名無しエンジニア' : data.author.display_name;
  const authorInitial = data.is_anonymous ? '匿' : data.author.display_name[0];
  const timeAgo = formatDistanceToNow(new Date(data.created_at), { locale: ja, addSuffix: false });
  const likes = getTotalLikes(data);
  const emoji = TYPE_EMOJI[type];

  return (
    <Link to={link} className="flex gap-5 group py-5">
      {/* Emoji icon */}
      <div className="shrink-0 w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-2xl">
        {emoji}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <h3 className="text-base font-semibold leading-relaxed group-hover:text-primary transition-colors line-clamp-2 mb-2">
          {title}
        </h3>
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">{authorInitial}</AvatarFallback>
          </Avatar>
          <span className="truncate">{authorName}</span>
          <span className="text-xs">{timeAgo}前</span>
          {likes > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <Heart className="h-3.5 w-3.5" />
              {likes}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
