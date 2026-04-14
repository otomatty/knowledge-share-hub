import { Link, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ContentReactions } from "@/components/shared/ContentReactions";
import { CommentSection } from "@/components/shared/CommentSection";
import { useTipByIdMapped } from "@/hooks/use-domain-queries";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

export default function TipDetail() {
  const { id } = useParams();
  const { data: tip, isLoading, isError } = useTipByIdMapped(id);

  if (isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">読み込み中…</p>
      </MainLayout>
    );
  }

  if (isError || !tip) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">気づきが見つかりません</p>
      </MainLayout>
    );
  }

  const authorName = tip.is_anonymous
    ? "名無しエンジニア"
    : tip.author.display_name;
  const authorInitial = tip.is_anonymous ? "匿" : tip.author.display_name[0];
  const timeAgo = formatDistanceToNow(new Date(tip.created_at), {
    locale: ja,
    addSuffix: true,
  });

  return (
    <MainLayout>
      <article className="bg-card rounded-lg border p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {authorInitial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            {tip.is_anonymous ? (
              <span className="text-sm font-medium">{authorName}</span>
            ) : (
              <Link
                to={`/users/${tip.author.username}`}
                className="text-sm font-medium hover:text-primary"
              >
                {authorName}
              </Link>
            )}
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
        </div>

        <p className="text-base leading-relaxed whitespace-pre-wrap mb-4">
          {tip.content}
        </p>

        {tip.tags.length > 0 && (
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {tip.tags.map((tag) => (
              <Link key={tag.id} to={`/search?tag=${tag.name}`}>
                <Badge
                  variant="secondary"
                  className="text-xs hover:bg-primary/10"
                >
                  {tag.name}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        <ContentReactions contentType="tip" contentId={tip.id} />
      </article>

      <section className="bg-card rounded-lg border p-6">
        <CommentSection contentType="tip" contentId={tip.id} />
      </section>
    </MainLayout>
  );
}
