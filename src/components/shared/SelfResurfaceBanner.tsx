import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// App.tsx mounts only the Sonner toaster, not the shadcn `ui/toaster`
// provider. Using `@/hooks/use-toast` here would render into nothing,
// which is what the rest of the codebase (TipNew etc.) avoids by going
// through `sonner` directly.
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAcknowledgeResurfacing,
  useAddTipAddendum,
  TIP_ADDENDUM_MAX_LENGTH,
  type SelfResurfacing,
} from "@/hooks/use-tip-resurfacings";

/**
 * "気づきの熟成" banner for issue #10 — shown above the main feed when
 * the current user has pending self-resurfacing prompts (rows the cron
 * inserted in `tip_resurfacings`).
 *
 * Actions:
 *  - 追記する      → dialog appends a dated reflection to the original tip
 *  - 育った気づき → navigate to /tips/new?grown_from=<id> with a pre-fill
 *  - 閉じる        → just mark acknowledged, no navigation
 *
 * Every action ends with `acknowledge` so the same prompt doesn't keep
 * resurfacing on every feed render.
 */
export function SelfResurfaceBanner({ items }: { items: SelfResurfacing[] }) {
  const [ackDialogId, setAckDialogId] = useState<string | null>(null);
  const [addendum, setAddendum] = useState("");
  const navigate = useNavigate();
  const { profile } = useAuth();
  const ack = useAcknowledgeResurfacing();
  const append = useAddTipAddendum();

  if (items.length === 0) return null;

  const active = items.find((r) => r.id === ackDialogId) ?? null;

  const closeDialog = () => {
    setAckDialogId(null);
    setAddendum("");
  };

  // Best-effort acknowledge. Every call site proceeds regardless of
  // outcome: a failed update just means the banner reappears on the
  // next refresh, which is less bad than stranding the user on a
  // half-finished flow. Kept silent rather than toast-on-failure to
  // avoid noise when the network blips during a navigation.
  const tryAck = async (id: string) => {
    try {
      await ack.mutateAsync({ id });
    } catch {
      // swallow — see rationale above
    }
  };

  const handleAppend = async () => {
    if (!active || !profile) return;
    // Split the two mutations so we can distinguish "the append failed
    // and nothing landed" (retryable, show error) from "the append
    // succeeded but the acknowledge side-effect failed" (not retryable,
    // would silently double-write if the user tapped again). The ack
    // failure path is handled exactly like dismiss(): swallowed.
    try {
      await append.mutateAsync({
        tipId: active.tip.id,
        authorId: profile.id,
        content: addendum,
      });
    } catch (err) {
      toast.error("追記に失敗しました", {
        description:
          err instanceof Error
            ? err.message
            : "時間をおいて再度お試しください。",
      });
      return;
    }
    await tryAck(active.id);
    toast.success("追記しました", {
      description: "1週間前の気づきに、今の視点を重ねました。",
    });
    closeDialog();
  };

  const dismiss = (id: string) => {
    void tryAck(id);
  };

  const goGrowNew = async (item: SelfResurfacing) => {
    // Best-effort acknowledge, then navigate regardless. Leaving this
    // un-caught previously meant an ack failure would abort the
    // navigation silently — worse UX than a lingering banner.
    await tryAck(item.id);
    navigate(`/tips/new?grown_from=${item.tip.id}`);
  };

  return (
    <>
      <section
        aria-label="過去の気づきの再読み"
        className="mb-6 rounded-lg border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20"
      >
        <div className="flex items-start gap-2 mb-3">
          <Sparkles
            className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-300 shrink-0"
            aria-hidden
          />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              気づきの熟成
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              1週間前のあなたの気づき。今のあなたはどう感じる？
            </p>
          </div>
        </div>

        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border bg-background/80 p-3 flex flex-col gap-2"
            >
              <Link
                to={`/tips/${item.tip.id}`}
                className="text-sm leading-relaxed hover:text-primary transition-colors line-clamp-3"
              >
                {item.tip.content}
              </Link>
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAckDialogId(item.id)}
                >
                  追記する
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => goGrowNew(item)}
                >
                  育った気づきとして再投稿
                </Button>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="この再読みを閉じる"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Dialog
        open={!!active}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>今の視点で追記する</DialogTitle>
            <DialogDescription>
              1週間前の気づきに、今のあなたの追記を重ねます。追記は元の気づきの下に
              時系列で並びます。
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground border-l-2 border-muted pl-3 whitespace-pre-wrap">
                {active.tip.content}
              </div>
              <Textarea
                value={addendum}
                onChange={(e) =>
                  setAddendum(
                    e.target.value.slice(0, TIP_ADDENDUM_MAX_LENGTH),
                  )
                }
                placeholder="今のあなたはどう感じる？"
                rows={4}
                maxLength={TIP_ADDENDUM_MAX_LENGTH}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-right">
                {addendum.length}/{TIP_ADDENDUM_MAX_LENGTH}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              キャンセル
            </Button>
            <Button
              onClick={handleAppend}
              disabled={!addendum.trim() || append.isPending || ack.isPending}
            >
              {append.isPending ? "追記中…" : "追記する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
