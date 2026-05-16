import { Link, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ContentReactions } from "@/components/shared/ContentReactions";
import { ContentCard } from "@/components/shared/ContentCard";
import { CommentSection } from "@/components/shared/CommentSection";
import { TagBadgeLink } from "@/components/shared/TagBadgeLink";
import { sortTagsByCategory } from "@/lib/tag-utils";
import { useTipByIdMapped } from "@/hooks/use-domain-queries";
import {
  useTipAttemptsForSource,
  useMyAttemptForTip,
  useSourceAttemptForResult,
} from "@/hooks/use-tip-attempts";
import { useTipAddendums } from "@/hooks/use-tip-resurfacings";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Repeat, CornerDownRight, Sparkles } from "lucide-react";

export default function TipDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { data: tip, isLoading, isError } = useTipByIdMapped(id);

  // Lineage data — issue #8.
  // • attempts: everyone who 🔁'd (or posted a result for) this tip
  // • myAttempt: used to gate the "post result" CTA for the current viewer
  // • source: set iff *this* tip is itself the result of trying another tip
  const { data: attempts = [] } = useTipAttemptsForSource(tip?.id);
  const { data: myAttempt } = useMyAttemptForTip(tip?.id, profile?.id);
  const { data: source } = useSourceAttemptForResult(tip?.id);
  // Re-read addendums (issue #10): each row is a later reflection the
  // tip's author appended when the resurfacing prompt surfaced their
  // past tip. Rendered chronologically under the original body.
  const { data: addendums = [] } = useTipAddendums(tip?.id);

  if (isLoading) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">読み込み中…</p>
      </MainLayout>
    );
  }

  if (isError) {
    return (
      <MainLayout>
        <p className="text-destructive py-12">
          気づきの読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      </MainLayout>
    );
  }

  if (!tip) {
    return (
      <MainLayout>
        <p className="text-muted-foreground py-12">気づきが見つかりません</p>
      </MainLayout>
    );
  }

  const authorName = tip.is_anonymous
    ? "名無しエンジニア"
    : (tip.author?.display_name ?? "ユーザー");
  const authorInitial = tip.is_anonymous
    ? "匿"
    : (tip.author?.display_name?.[0]?.toUpperCase() ?? "?");
  const timeAgo = formatDistanceToNow(new Date(tip.created_at), {
    locale: ja,
    addSuffix: true,
  });

  // "People who tried this" — every attempt row, with or without a result.
  const triedBy = attempts;
  // "Results from this tip" — only rows that actually produced a result tip.
  const results = attempts.filter((a) => a.resultTip !== null);

  const isOwnTip = profile?.id === tip.author.id;
  // Show the CTA only for truly pending pledges. `completed_at` is a
  // one-way latch (migration 00015): once the loop has closed, the
  // attempt stays "completed" even if the result tip was later deleted
  // (state `result_tip_id IS NULL && completed_at IS NOT NULL`). Those
  // rows should not re-trigger the CTA — the DB rejects re-linking
  // anyway, so a click would only produce an error toast.
  const showPostResultCta =
    profile &&
    !isOwnTip &&
    myAttempt &&
    myAttempt.result_tip_id === null &&
    myAttempt.completed_at === null;

  return (
    <MainLayout>
      {/* "派生元" backlink — this tip is the result of trying another tip. */}
      {source && (
        <Link
          to={`/tips/${source.sourceTip.id}`}
          className="mb-3 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground hover:bg-primary/10 transition-colors"
        >
          <CornerDownRight className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <span className="min-w-0">
            <span className="text-primary font-medium">派生元</span>
            <span className="ml-2 line-clamp-1 inline align-bottom">
              {source.sourceTip.content}
            </span>
          </span>
        </Link>
      )}

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

        {addendums.length > 0 && (
          <ul className="mb-4 space-y-2">
            {addendums.map((a) => (
              <li
                key={a.id}
                className="rounded-md border-l-2 border-amber-400/70 bg-amber-50/40 dark:bg-amber-950/20 pl-3 pr-2 py-2"
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  <span>
                    再読み追記 ·{" "}
                    {format(new Date(a.createdAt), "yyyy-MM-dd", { locale: ja })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {a.content}
                </p>
              </li>
            ))}
          </ul>
        )}

        {tip.tags.length > 0 && (
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {sortTagsByCategory(tip.tags).map((tag) => (
              <TagBadgeLink key={tag.id} tag={tag} />
            ))}
          </div>
        )}

        <ContentReactions contentType="tip" contentId={tip.id} />

        {showPostResultCta && (
          <div className="mt-4 pt-4 border-t">
            <Button asChild size="sm" className="gap-1.5">
              <Link to={`/tips/new?source=${tip.id}`}>
                <Repeat className="h-3.5 w-3.5" />
                試した結果を投稿する
              </Link>
            </Button>
          </div>
        )}
      </article>

      {/* "この気づきから試した人" */}
      {triedBy.length > 0 && (
        <section className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Repeat className="h-4 w-4 text-primary" />
            この気づきから試した人 ({triedBy.length})
          </h2>
          <ul className="flex flex-wrap gap-3">
            {triedBy.map(({ attempt, user, resultTip }) => {
              // If the linked result tip is anonymous, masking the
              // trier's identity here too — otherwise a viewer can
              // correlate "only pledger with 結果あり" with the single
              // anonymous result card in the section below and
              // de-anonymize the post. Mirror the convention used by
              // ContentCard / notifications for `is_anonymous` tips.
              const maskIdentity = resultTip?.is_anonymous === true;
              const displayName = maskIdentity
                ? "名無しエンジニア"
                : (user.display_name ?? "ユーザー");
              const initial = maskIdentity
                ? "匿"
                : (user.display_name?.[0]?.toUpperCase() ?? "?");
              const identity = (
                <>
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{displayName}</span>
                </>
              );
              return (
                <li key={attempt.id} className="flex items-center gap-2">
                  {maskIdentity ? (
                    <div className="flex items-center gap-2">{identity}</div>
                  ) : (
                    <Link
                      to={`/users/${user.username}`}
                      className="flex items-center gap-2 hover:text-primary"
                    >
                      {identity}
                    </Link>
                  )}
                  {attempt.result_tip_id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      結果あり
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* "試した結果" */}
      {results.length > 0 && (
        <section className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            📘 試した結果 ({results.length})
          </h2>
          <p className="text-xs text-muted-foreground mb-2">
            この気づきをきっかけに生まれた新しい気づきたち
          </p>
          <ul className="divide-y">
            {results.map(({ attempt, resultTip }) =>
              resultTip ? (
                <li key={attempt.id}>
                  <ContentCard data={resultTip} />
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      <section className="bg-card rounded-lg border p-6">
        <CommentSection contentType="tip" contentId={tip.id} />
      </section>
    </MainLayout>
  );
}
