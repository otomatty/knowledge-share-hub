import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ReactionButtons } from './ReactionButtons';
import { TagBadgeLink } from './TagBadgeLink';
import { sortTagsByCategory } from '@/lib/tag-utils';
import { DISPLAY_NAME_FALLBACK } from '@/lib/profile-mapper';
import type { Tip } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ContentCardProps {
  data: Tip;
}

export function ContentCard({ data }: ContentCardProps) {
  const authorName = data.is_anonymous
    ? '名無しエンジニア'
    : (data.author?.display_name ?? DISPLAY_NAME_FALLBACK);
  const authorInitial = data.is_anonymous
    ? '匿'
    : (data.author?.display_name?.[0]?.toUpperCase() ?? '?');
  const timeAgo = formatDistanceToNow(new Date(data.created_at), { locale: ja, addSuffix: true });

  return (
    <div className="py-4">
      {/* Author row */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">{authorInitial}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{authorName}</span>
        <span className="text-xs text-muted-foreground">{timeAgo}</span>
      </div>

      {/* Content */}
      <Link to={`/tips/${data.id}`} className="block group">
        <p className="text-sm leading-relaxed mb-2 group-hover:text-primary transition-colors">
          {data.content}
        </p>
      </Link>

      {/* Tags — context tags first, then tech tags */}
      {data.tags.length > 0 && (
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {sortTagsByCategory(data.tags).map(tag => (
            <TagBadgeLink key={tag.id} tag={tag} />
          ))}
        </div>
      )}

      {/* Reactions + comments */}
      <div className="flex items-center gap-3">
        <ReactionButtons reactions={data.reactions} variant="distribution" size="sm" />
        {(data.comment_count ?? 0) > 0 && (
          <Link
            to={`/tips/${data.id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {data.comment_count}
          </Link>
        )}
      </div>
    </div>
  );
}
