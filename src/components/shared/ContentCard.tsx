import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ReactionButtons } from './ReactionButtons';
import type { Tip } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ContentCardProps {
  type: 'tip';
  data: Tip;
}

export function ContentCard({ data }: ContentCardProps) {
  const authorName = data.is_anonymous ? '名無しエンジニア' : data.author.display_name;
  const authorInitial = data.is_anonymous ? '匿' : data.author.display_name[0];
  const timeAgo = formatDistanceToNow(new Date(data.created_at), { locale: ja, addSuffix: true });

  return (
    <div className="border-b py-4 last:border-b-0">
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
