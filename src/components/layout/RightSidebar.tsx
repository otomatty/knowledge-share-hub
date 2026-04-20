import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Hash, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TagFollowButton } from "@/components/shared/TagFollowButton";
import {
  useTipsMapped,
  useTrendingTags,
} from "@/hooks/use-domain-queries";
import { useTags } from "@/hooks/use-supabase-query";
import { useMyTagFollows } from "@/hooks/use-tag-follows";
import { useAuth } from "@/contexts/AuthContext";
import type { Tag } from "@/types";

export function RightSidebar() {
  const { profile } = useAuth();
  const { data: tips = [], isLoading: tipLoading } = useTipsMapped();
  const {
    data: trendingTags = { tech: [], context: [] },
    isLoading: tagLoading,
  } = useTrendingTags();
  // The follow list is small (one row per followed tag) and guarded by
  // RLS to the viewer; `useTags` is the same query the picker already
  // uses, so it's warm in cache most of the time.
  const { data: followedIds } = useMyTagFollows(profile?.id);
  const { data: allTags = [] } = useTags();
  const followedTags = useMemo<Tag[]>(() => {
    if (!followedIds || followedIds.size === 0) return [];
    return (allTags as Tag[]).filter((t) => followedIds.has(t.id));
  }, [allTags, followedIds]);

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
      {followedTags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <BellRing className="h-4 w-4 text-primary" />
              フォロー中のタグ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {followedTags.map((tag) => {
                const isContext = tag.category === "context";
                return (
                  <div key={tag.id} className="flex items-center gap-0.5">
                    <Link
                      to={`/search?tag=${encodeURIComponent(tag.name)}`}
                    >
                      <Badge
                        variant={isContext ? "outline" : "secondary"}
                        className={
                          isContext
                            ? "text-xs border-kh-purple/40 text-kh-purple hover:bg-kh-purple/10 cursor-pointer"
                            : "text-xs hover:bg-primary/10 cursor-pointer"
                        }
                      >
                        {tag.name}
                      </Badge>
                    </Link>
                    <TagFollowButton tag={tag} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Hash className="h-4 w-4 text-kh-purple" />
              気づきの種類
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {trendingTags.context.map(({ tag }) => (
                <div key={tag.id} className="flex items-center gap-0.5">
                  <Link to={`/search?tag=${encodeURIComponent(tag.name)}`}>
                    <Badge
                      variant="outline"
                      className="border-kh-purple/40 text-kh-purple hover:bg-kh-purple/10 cursor-pointer"
                    >
                      {tag.name}
                    </Badge>
                  </Link>
                  <TagFollowButton tag={tag} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Hash className="h-4 w-4 text-primary" />
            技術タグ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {trendingTags.tech.map(({ tag }) => (
              <div key={tag.id} className="flex items-center gap-0.5">
                <Link to={`/search?tag=${encodeURIComponent(tag.name)}`}>
                  <Badge
                    variant="secondary"
                    className="hover:bg-primary/10 hover:text-primary cursor-pointer"
                  >
                    {tag.name}
                  </Badge>
                </Link>
                {/* Tech tags need an in-app follow entry point too
                    (SearchPage only surfaces context chips); adding
                    the bell here covers the tech-only follower flow. */}
                <TagFollowButton tag={tag} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
