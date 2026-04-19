import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMarkAllNotificationsRead,
  useNotifications,
} from "@/hooks/use-supabase-query";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Bell, Check } from "lucide-react";

// Small per-type icon prefix so the try-it loop shows up distinctly in the
// feed — the follow-up nudge and the "your tip produced a result" win both
// read very differently from a plain reaction/comment notification.
const TYPE_ICON: Record<string, string> = {
  try_it_followup: "🔁",
  try_it_result: "🎉",
  resurface_self: "✨",
  reaction: "💬",
  comment: "💬",
  reply: "💬",
};

export default function Notifications() {
  const { profile } = useAuth();
  const { data: notifications = [], isLoading } = useNotifications(
    profile?.id ?? "",
  );
  const markAll = useMarkAllNotificationsRead();

  const markAllRead = () => {
    if (profile?.id) {
      markAll.mutate(profile.id);
    }
  };

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> 通知
          </h1>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={markAllRead}
            disabled={!profile || markAll.isPending}
          >
            <Check className="h-4 w-4" /> すべて既読にする
          </Button>
        </div>
        {isLoading && (
          <p className="text-muted-foreground text-sm">読み込み中…</p>
        )}
        <div className="bg-card rounded-lg border divide-y">
          {notifications.map((n) => {
            const icon = TYPE_ICON[n.type] ?? "•";
            // Only link through when we have a tip to land on. content_type
            // is constrained to 'tip' at the DB level, but be defensive.
            const href =
              n.content_type === "tip" ? `/tips/${n.content_id}` : null;

            const body = (
              <div
                className={`p-4 flex items-start gap-3 ${!n.is_read ? "bg-primary/5" : ""} ${href ? "hover:bg-muted/30 transition-colors" : ""}`}
              >
                {!n.is_read && (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
                <span className="mt-0.5 text-lg leading-none" aria-hidden>
                  {icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), {
                      locale: ja,
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            );

            return href ? (
              <Link key={n.id} to={href} className="block">
                {body}
              </Link>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
          {!isLoading && notifications.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              通知はありません
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
