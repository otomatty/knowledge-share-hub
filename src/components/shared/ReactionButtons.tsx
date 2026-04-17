import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { REACTION_CONFIG, type ReactionSummary, type ReactionType } from '@/types';

const DISTRIBUTION_COLORS: Record<ReactionType, string> = {
  same_thought: 'bg-kh-blue-light',
  new_view: 'bg-kh-yellow',
  try_it: 'bg-kh-green',
  learned: 'bg-kh-purple',
};

interface ReactionButtonsProps {
  reactions: ReactionSummary;
  variant?: 'buttons' | 'distribution';
  size?: 'sm' | 'default';
  /** When set, buttons reflect server state and call onToggle instead of local-only demo mode. */
  activeTypes?: Set<ReactionType>;
  onToggle?: (type: ReactionType) => void;
  disabled?: boolean;
}

export function ReactionButtons({
  reactions,
  variant = 'buttons',
  size = 'default',
  activeTypes,
  onToggle,
  disabled = false,
}: ReactionButtonsProps) {
  const [localReactions, setLocalReactions] = useState(reactions);
  const [activeReactions, setActiveReactions] = useState<Set<ReactionType>>(new Set());

  useEffect(() => {
    setLocalReactions(reactions);
  }, [reactions]);

  useEffect(() => {
    if (activeTypes !== undefined) {
      setActiveReactions(new Set(activeTypes));
    }
  }, [activeTypes]);

  const toggle = (type: ReactionType) => {
    if (onToggle) {
      onToggle(type);
      return;
    }
    const next = new Set(activeReactions);
    if (next.has(type)) {
      next.delete(type);
      setLocalReactions(prev => ({ ...prev, [type]: prev[type] - 1 }));
    } else {
      next.add(type);
      setLocalReactions(prev => ({ ...prev, [type]: prev[type] + 1 }));
    }
    setActiveReactions(next);
  };

  const isSmall = size === 'sm';

  if (variant === 'distribution') {
    return <ReactionDistribution reactions={reactions} size={size} />;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {(Object.entries(REACTION_CONFIG) as [ReactionType, { emoji: string; label: string }][]).map(([type, config]) => {
        const count = localReactions[type];
        const active = activeReactions.has(type);
        return (
          <Button
            key={type}
            variant={active ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            className={`gap-1 ${isSmall ? 'h-7 text-xs px-2' : 'h-8 text-sm px-3'} ${active ? '' : 'hover:bg-primary/5 hover:border-primary/30'}`}
            onClick={() => toggle(type)}
            title={config.label}
          >
            <span>{config.emoji}</span>
            {count > 0 && <span>{count}</span>}
          </Button>
        );
      })}
    </div>
  );
}

/* ── Distribution bar sub-component ── */

function ReactionDistribution({
  reactions,
  size = 'default',
}: {
  reactions: ReactionSummary;
  size?: 'sm' | 'default';
}) {
  const entries = (
    Object.entries(REACTION_CONFIG) as [ReactionType, { emoji: string; label: string }][]
  ).map(([type, config]) => ({
    type,
    count: reactions[type],
    ...config,
  }));

  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const isSmall = size === 'sm';
  const barHeight = isSmall ? 'h-6' : 'h-8';

  if (total === 0) {
    return (
      <div
        className={`w-full ${barHeight} rounded-full bg-muted flex items-center justify-center`}
      >
        <span className="text-xs text-muted-foreground">
          まだリアクションがありません
        </span>
      </div>
    );
  }

  return (
    <div className={`w-full ${barHeight} rounded-full overflow-hidden flex`}>
      {entries.map(({ type, count, emoji, label }) => {
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${emoji} ${label}: ${count}件`}
                className={`${DISTRIBUTION_COLORS[type]} flex items-center justify-center gap-0.5 min-w-0 overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSmall ? 'text-xs' : 'text-sm'}`}
                style={{ width: `${pct}%` }}
              >
                {pct >= 10 && <span className="shrink-0">{emoji}</span>}
                {pct >= 20 && (
                  <span className="truncate font-medium">
                    {Math.round(pct)}%
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {emoji} {label}: {count}件
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
