import { useParams, Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ContentReactions } from "@/components/shared/ContentReactions";
import { CommentSection } from "@/components/shared/CommentSection";
import { useArticleByIdMapped } from "@/hooks/use-domain-queries";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Edit, BookOpen } from "lucide-react";

export default function ArticleDetail() {
  const { id } = useParams();
  const { data: article, isLoading, isError } = useArticleByIdMapped(id);

  if (isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground">読み込み中…</p>
      </MainLayout>
    );
  }

  if (isError || !article) {
    return (
      <MainLayout>
        <p className="text-muted-foreground">記事が見つかりません</p>
      </MainLayout>
    );
  }

  const authorName = article.is_anonymous
    ? "名無しエンジニア"
    : article.author.display_name;

  const headings = Array.from(
    article.content.matchAll(/<h([23])[^>]*>(.*?)<\/h[23]>/g),
  ).map((m, i) => ({
    level: parseInt(m[1], 10),
    text: m[2].replace(/<[^>]*>/g, ""),
    id: `heading-${i}`,
  }));

  return (
    <MainLayout>
      <article className="max-w-3xl">
        <h1 className="text-3xl font-bold mb-4 leading-tight">{article.title}</h1>

        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {authorName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <Link
              to={`/users/${article.author.username}`}
              className="font-medium hover:text-primary"
            >
              {authorName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(article.created_at), {
                locale: ja,
                addSuffix: true,
              })}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto gap-1" asChild>
            <Link to={`/articles/${article.id}/edit`}>
              <Edit className="h-4 w-4" /> 編集
            </Link>
          </Button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {article.tags.map((tag) => (
            <Badge key={tag.id} variant="secondary">
              {tag.name}
            </Badge>
          ))}
        </div>

        {headings.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <h2 className="flex items-center gap-2 font-semibold mb-2 text-sm">
              <BookOpen className="h-4 w-4" /> 目次
            </h2>
            <ul className="space-y-1">
              {headings.map((h, i) => (
                <li
                  key={i}
                  className={`text-sm text-muted-foreground hover:text-foreground ${h.level === 3 ? "ml-4" : ""}`}
                >
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className="prose prose-sm max-w-none mb-8"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

        <ContentReactions contentType="article" contentId={article.id} />

        <Separator className="my-8" />

        <CommentSection contentType="article" contentId={article.id} />
      </article>
    </MainLayout>
  );
}
