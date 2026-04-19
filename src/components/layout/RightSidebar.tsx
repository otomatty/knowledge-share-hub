import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useTipsMapped,
  useTrendingTags,
} from "@/hooks/use-domain-queries";

export function RightSidebar() {
  const { data: tips = [], isLoading: tipLoading } = useTipsMapped();
  const {
    data: trendingTags = { tech: [], context: [] },
    isLoading: tagLoading,
  } = useTrendingTags();

  const recentTips = useMemo(() => tips.slice(0, 3), [tips]);

  const loading = tipLoading || tagLoading;

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
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            最近の気づき
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentTips.map((tip) => (
            <Link
              key={tip.id}
              to={`/tips/${tip.id}`}
              className="block group"
            >
              <p className="text-sm leading-relaxed group-hover:text-primary line-clamp-2">
                {tip.content}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tip.is_anonymous ? "名無しエンジニア" : tip.author.display_name}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>

      {trendingTags.context.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Hash className="h-4 w-4 text-kh-purple" />
              気づきの種類
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {trendingTags.context.map(({ tag }) => (
                <Link
                  key={tag.id}
                  to={`/search?tag=${encodeURIComponent(tag.name)}`}
                >
                  <Badge
                    variant="outline"
                    className="border-kh-purple/40 text-kh-purple hover:bg-kh-purple/10 cursor-pointer"
                  >
                    {tag.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Hash className="h-4 w-4 text-primary" />
            技術タグ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {trendingTags.tech.map(({ tag }) => (
              <Link key={tag.id} to={`/search?tag=${encodeURIComponent(tag.name)}`}>
                <Badge
                  variant="secondary"
                  className="hover:bg-primary/10 hover:text-primary cursor-pointer"
                >
                  {tag.name}
                </Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
