import { useParams, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { mockBooks } from '@/lib/mock-data';
import { BookOpen, ChevronRight } from 'lucide-react';

export default function BookDetail() {
  const { id } = useParams();
  const book = mockBooks.find(b => b.id === id) || mockBooks[0];

  return (
    <MainLayout>
      <div className="max-w-3xl">
        <div className="flex items-start gap-6 mb-6">
          {book.cover_image_url ? (
            <img src={book.cover_image_url} alt={book.title} className="w-32 h-44 object-cover rounded-lg border" />
          ) : (
            <div className="w-32 h-44 bg-primary/5 rounded-lg border flex items-center justify-center">
              <BookOpen className="h-10 w-10 text-primary/30" />
            </div>
          )}
          <div>
            <Badge variant="secondary" className="mb-2">📚 ブック</Badge>
            <h1 className="text-2xl font-bold mb-2">{book.title}</h1>
            <p className="text-muted-foreground text-sm mb-3">{book.description}</p>
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">{book.author.display_name[0]}</AvatarFallback>
              </Avatar>
              <Link to={`/users/${book.author.username}`} className="text-sm font-medium hover:text-primary">{book.author.display_name}</Link>
            </div>
          </div>
        </div>

        <h2 className="font-semibold text-lg mb-3">目次（{book.chapters.length}章）</h2>
        <div className="space-y-2">
          {book.chapters.map(ch => (
            <Link key={ch.id} to={`/articles/${ch.article.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground/40 w-8">{ch.order}</span>
                  <div className="flex-1">
                    <p className="font-medium">{ch.article.title}</p>
                    <div className="flex gap-1.5 mt-1">
                      {ch.article.tags.map(tag => <Badge key={tag.id} variant="secondary" className="text-xs">{tag.name}</Badge>)}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
