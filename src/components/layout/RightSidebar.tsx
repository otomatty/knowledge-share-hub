import { useMemo } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Hash, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  useArticlesMapped,
  useTrendingTags,
  useWeeklyUserRanking,
} from "@/hooks/use-domain-queries";

export function RightSidebar() {
  const { data: articles = [], isLoading: artLoading } = useArticlesMapped();
  const { data: trendingTags = [], isLoading: tagLoading } = useTrendingTags();
  const { data: weeklyRanking = [], isLoading: rankLoading } =
    useWeeklyUserRanking();

  const topArticles = useMemo(() => {
    return [...articles]
      .sort((a, b) => {
        const scoreA = Object.values(a.reactions).reduce((s, v) => s + v, 0);
        const scoreB = Object.values(b.reactions).reduce((s, v) => s + v, 0);
        return scoreB - scoreA;
      })
      .slice(0, 3);
  }, [articles]);

  const loading = artLoading || tagLoading || rankLoading;

  if (loading) {
    return (
      <aside className="hidden lg:block w-72 shrink-0 space-y-4">
        <p className="text-sm text-muted-foreground">読み込み中…</p>
      </aside>
    );
  }

  return (
    <aside className="hidden lg:block w-72 shrink-0 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-kh-orange" />
            週間ランキング
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topArticles.map((article, i) => (
            <Link
              key={article.id}
              to={`/articles/${article.id}`}
              className="flex gap-3 group"
            >
              <span className="text-lg font-bold text-muted-foreground/50 w-5">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight group-hover:text-primary line-clamp-2">
                  {article.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {article.author.display_name}
                </p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Hash className="h-4 w-4 text-primary" />
            注目のタグ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {trendingTags.map(({ tag, count }) => (
              <Link key={tag.id} to={`/search?tag=${encodeURIComponent(tag.name)}`}>
                <Badge
                  variant="secondary"
                  className="hover:bg-primary/10 hover:text-primary cursor-pointer"
                >
                  {tag.name}
                  <span className="ml-1 text-muted-foreground text-[10px]">
                    {count}
                  </span>
                </Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-kh-green" />
            注目のユーザー
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {weeklyRanking.map(({ user, reactionCount }) => (
            <Link
              key={user.id}
              to={`/users/${user.username}`}
              className="flex items-center gap-3 group"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {user.display_name[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium group-hover:text-primary truncate">
                  {user.display_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  🙏 {reactionCount} reactions
                </p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </aside>
  );
}
