import { useParams, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ReactionButtons } from '@/components/shared/ReactionButtons';
import { CommentSection } from '@/components/shared/CommentSection';
import { mockArticles } from '@/lib/mock-data';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Edit, BookOpen } from 'lucide-react';

export default function ArticleDetail() {
  const { id } = useParams();
  const article = mockArticles.find(a => a.id === id) || mockArticles[0];
  const authorName = article.is_anonymous ? '名無しエンジニア' : article.author.display_name;

  // Extract headings for TOC
  const headings = Array.from(article.content.matchAll(/<h([23])[^>]*>(.*?)<\/h[23]>/g)).map((m, i) => ({
    level: parseInt(m[1]),
    text: m[2].replace(/<[^>]*>/g, ''),
    id: `heading-${i}`,
  }));

  return (
    <MainLayout>
      <article className="max-w-3xl">
        {/* Title */}
        <h1 className="text-3xl font-bold mb-4 leading-tight">{article.title}</h1>

        {/* Author info */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">{authorName[0]}</AvatarFallback>
          </Avatar>
          <div>
            <Link to={`/users/${article.author.username}`} className="font-medium hover:text-primary">{authorName}</Link>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(article.created_at), { locale: ja, addSuffix: true })}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto gap-1" asChild>
            <Link to={`/articles/${article.id}/edit`}><Edit className="h-4 w-4" /> 編集</Link>
          </Button>
        </div>

        {/* Tags */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {article.tags.map(tag => (
            <Badge key={tag.id} variant="secondary">{tag.name}</Badge>
          ))}
        </div>

        {/* TOC */}
        {headings.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <h2 className="flex items-center gap-2 font-semibold mb-2 text-sm">
              <BookOpen className="h-4 w-4" /> 目次
            </h2>
            <ul className="space-y-1">
              {headings.map((h, i) => (
                <li key={i} className={`text-sm text-muted-foreground hover:text-foreground ${h.level === 3 ? 'ml-4' : ''}`}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Body */}
        <div className="prose prose-sm max-w-none mb-8" dangerouslySetInnerHTML={{ __html: article.content }} />

        {/* Reactions */}
        <ReactionButtons reactions={article.reactions} />

        <Separator className="my-8" />

        {/* Comments */}
        <CommentSection contentType="article" contentId={article.id} />
      </article>
    </MainLayout>
  );
}
