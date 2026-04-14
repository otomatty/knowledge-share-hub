import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TipsDialog } from "@/components/shared/TipsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/use-supabase-query";

export function Header() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: notifications = [] } = useNotifications(profile?.id ?? "");
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );
  const [tipDialogOpen, setTipDialogOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
            <span className="text-primary">📚</span>
            <span className="hidden sm:inline">KnowledgeHub</span>
          </Link>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/search")}>
              <Search className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => navigate("/notifications")}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
                  {unreadCount}
                </Badge>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full hover:bg-muted p-1"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {profile?.display_name?.[0] ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() =>
                    profile && navigate(`/users/${profile.username}`)
                  }
                >
                  マイページ
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings/profile")}>
                  プロフィール設定
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate("/login");
                  }}
                >
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              className="gap-1 ml-2"
              variant="outline"
              onClick={() => setTipDialogOpen(true)}
              aria-label="気づきを投稿"
            >
              <PenSquare className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline" aria-hidden="true">
                気づきを投稿
              </span>
            </Button>
          </div>
        </div>
      </header>

      <TipsDialog open={tipDialogOpen} onOpenChange={setTipDialogOpen} />
    </>
  );
}
