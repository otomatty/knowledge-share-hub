import { Clock3 } from "lucide-react";
import { ContentCard } from "./ContentCard";
import type { Tip } from "@/types";

/**
 * "今読み直したい1件" section for the main feed (issue #10). Renders up
 * to a few older tips from other users that still have enough reactions
 * to be worth re-reading. Visually distinct from the main feed — amber
 * accent + a quiet header — so it doesn't read as a duplicate of the
 * chronological list.
 */
export function ResurfacedFeedSection({ tips }: { tips: Tip[] }) {
  if (tips.length === 0) return null;

  return (
    <section
      aria-label="今読み直したい気づき"
      className="mb-6 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30"
    >
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Clock3
          className="h-4 w-4 text-muted-foreground shrink-0"
          aria-hidden
        />
        <h2 className="text-sm font-semibold">今読み直したい気づき</h2>
        <p className="text-xs text-muted-foreground">
          少し前に投稿された、時間をおいて読み返したい1件
        </p>
      </header>
      <div className="divide-y">
        {tips.map((tip) => (
          <div key={tip.id} className="px-4">
            <ContentCard data={tip} />
          </div>
        ))}
      </div>
    </section>
  );
}
