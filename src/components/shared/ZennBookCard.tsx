import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Heart } from 'lucide-react';
import type { Book } from '@/types';

interface ZennBookCardProps {
  book: Book;
}

function getBookLikes(book: Book): number {
  return book.chapters.reduce((total, ch) => {
    return total + Object.values(ch.article.reactions).reduce((s, v) => s + v, 0);
  }, 0);
}

export function ZennBookCard({ book }: ZennBookCardProps) {
  const authorName = book.author.display_name;
  const authorInitial = book.author.display_name[0];
  const likes = getBookLikes(book);

  return (
    <div className="shrink-0 w-44">
      <Link to={`/books/${book.id}`} className="group block">
        {/* Book cover placeholder */}
        <div className="w-full aspect-[3/4] rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border flex items-center justify-center mb-2 group-hover:shadow-md transition-shadow">
          <span className="text-3xl">📚</span>
        </div>
        <h3 className="text-xs font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {book.title}
        </h3>
      </Link>
      <div className="flex items-center gap-1.5 mt-1.5">
        <Link to={`/users/${book.author.username}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-w-0">
          <Avatar className="h-4 w-4 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-[8px]">{authorInitial}</AvatarFallback>
          </Avatar>
          <span className="truncate">{authorName}</span>
        </Link>
        {likes > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
            <Heart className="h-3 w-3" />
            {likes}
          </span>
        )}
      </div>
    </div>
  );
}
