import { useAuth } from "@/contexts/AuthContext";
import { useUserReactionTypesOnContent } from "@/hooks/use-domain-queries";
import { useReactionCounts, useToggleReaction } from "@/hooks/use-supabase-query";
import { emptyReactionSummary } from "@/lib/reaction-aggregates";
import { ReactionButtons } from "@/components/shared/ReactionButtons";
import type { ReactionType } from "@/types";

interface CommentReactionsProps {
  commentId: string;
  size?: "sm" | "default";
}

export function CommentReactions({ commentId, size = "sm" }: CommentReactionsProps) {
  const { user, profile } = useAuth();
  const { data: reactions } = useReactionCounts("comment", commentId);
  const { data: activeTypes } = useUserReactionTypesOnContent(
    user?.id,
    "comment",
    commentId,
  );
  const toggle = useToggleReaction();

  const handleToggle = (type: ReactionType) => {
    if (!profile) return;
    toggle.mutate({
      userId: profile.id,
      contentType: "comment",
      contentId: commentId,
      reactionType: type,
    });
  };

  return (
    <ReactionButtons
      reactions={
        reactions ?? emptyReactionSummary()
      }
      size={size}
      activeTypes={activeTypes}
      onToggle={handleToggle}
      disabled={!profile || toggle.isPending}
    />
  );
}
