import { useAuth } from "@/contexts/AuthContext";
import { useUserReactionTypesOnContent } from "@/hooks/use-domain-queries";
import { useReactionCounts, useToggleReaction } from "@/hooks/use-supabase-query";
import { emptyReactionSummary } from "@/lib/reaction-aggregates";
import { ReactionButtons } from "@/components/shared/ReactionButtons";
import type { ReactionType } from "@/types";

interface ContentReactionsProps {
  contentType: "tip";
  contentId: string;
}

export function ContentReactions({ contentType, contentId }: ContentReactionsProps) {
  const { user, profile } = useAuth();
  const { data: reactions } = useReactionCounts(contentType, contentId);
  const { data: activeTypes } = useUserReactionTypesOnContent(
    user?.id,
    contentType,
    contentId,
  );
  const toggle = useToggleReaction();

  const handleToggle = (type: ReactionType) => {
    if (!profile) return;
    toggle.mutate({
      userId: profile.id,
      contentType,
      contentId,
      reactionType: type,
    });
  };

  return (
    <ReactionButtons
      reactions={
        reactions ?? emptyReactionSummary()
      }
      activeTypes={activeTypes}
      onToggle={handleToggle}
      disabled={!profile || toggle.isPending}
    />
  );
}
