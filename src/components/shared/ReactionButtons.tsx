import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { REACTION_CONFIG, type ReactionSummary, type ReactionType } from '@/types';

interface ReactionButtonsProps {
  reactions: ReactionSummary;
  size?: 'sm' | 'default';
}

export function ReactionButtons({ reactions, size = 'default' }: ReactionButtonsProps) {
  const [localReactions, setLocalReactions] = useState(reactions);
  const [activeReactions, setActiveReactions] = useState<Set<ReactionType>>(new Set());

  const toggle = (type: ReactionType) => {
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
