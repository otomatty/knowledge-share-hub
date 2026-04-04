import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { mockNotifications } from '@/lib/mock-data';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Bell, Check } from 'lucide-react';

export default function Notifications() {
  const [notifications, setNotifications] = useState(mockNotifications);

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> 通知
          </h1>
          <Button variant="ghost" size="sm" className="gap-1" onClick={markAllRead}>
            <Check className="h-4 w-4" /> すべて既読にする
          </Button>
        </div>
        <div className="bg-card rounded-lg border divide-y">
          {notifications.map(n => (
            <div key={n.id} className={`p-4 flex items-start gap-3 ${!n.is_read ? 'bg-primary/5' : ''}`}>
              {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { locale: ja, addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
          {notifications.length === 0 && (
            <p className="text-center text-muted-foreground py-12">通知はありません</p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
