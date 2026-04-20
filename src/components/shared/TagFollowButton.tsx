import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useMyTagFollows, useToggleTagFollow } from "@/hooks/use-tag-follows";
import { cn } from "@/lib/utils";
import type { Tag } from "@/types";

interface TagFollowButtonProps {
  tag: Tag;
  /** Visual variant. `inline` matches chip size; `icon` is stand-alone. */
  size?: "inline" | "icon";
}

// Small toggle shown next to a tag badge. Reads the follower's own
// follow list (private by RLS) and flips the bell icon + toasts on
// success. Rendered behind `ProtectedRoute`, so `profile` should exist
// when this component mounts; the `!profile` branch is a defensive
// no-op rather than a user-facing state.
export function TagFollowButton({ tag, size = "inline" }: TagFollowButtonProps) {
  const { profile } = useAuth();
  const { data: followed } = useMyTagFollows(profile?.id);
  const toggle = useToggleTagFollow();

  const isFollowed = followed?.has(tag.id) ?? false;
  const disabled = !profile || toggle.isPending;

  const handleClick = (e: React.MouseEvent) => {
    // Sibling chips are often wrapped in a Link / filter button;
    // stop propagation so clicking the bell doesn't also trigger the
    // chip's filter action.
    e.preventDefault();
    e.stopPropagation();
    if (!profile) return;
    toggle.mutate(
      { userId: profile.id, tagId: tag.id },
      {
        onSuccess: (res) => {
          toast.success(
            res.followed
              ? `${tag.name} をフォローしました`
              : `${tag.name} のフォローを解除しました`,
          );
        },
        onError: () => {
          toast.error("フォローの更新に失敗しました");
        },
      },
    );
  };

  const Icon = isFollowed ? BellRing : Bell;
  const label = isFollowed ? "フォロー解除" : "フォロー";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          aria-label={`${tag.name}を${label}`}
          aria-pressed={isFollowed}
          className={cn(
            "inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            size === "inline" ? "h-6 w-6" : "h-8 w-8",
            isFollowed && "text-primary",
          )}
        >
          <Icon className={size === "inline" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
