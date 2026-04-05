import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, PenSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { currentUser, mockNotifications } from '@/lib/mock-data';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TipsDialog } from '@/components/shared/TipsDialog';

export function Header() {
  const navigate = useNavigate();
  const unreadCount = mockNotifications.filter(n => !n.is_read).length;
  const [tipDialogOpen, setTipDialogOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
            <span className="text-primary">📚</span>
            <span className="hidden sm:inline">KnowledgeHub</span>
          </Link>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            {/* Search */}
            <Button variant="ghost" size="icon" onClick={() => navigate('/search')}>
              <Search className="h-5 w-5" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative" onClick={() => navigate('/notifications')}>
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
                  {unreadCount}
                </Badge>
              )}
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full hover:bg-muted p-1">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {currentUser.display_name[0]}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate(`/users/${currentUser.username}`)}>
                  マイページ
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
                  プロフィール設定
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/login')}>
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* New post dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1 ml-2" variant="outline">
                  <PenSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">投稿する</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTipDialogOpen(true)}>💬 Tips（ひとこと）</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/memos/new')}>📝 メモ</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/articles/new')}>📄 記事</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/books/new')}>📚 ブック</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <TipsDialog open={tipDialogOpen} onOpenChange={setTipDialogOpen} />
    </>
  );
}
