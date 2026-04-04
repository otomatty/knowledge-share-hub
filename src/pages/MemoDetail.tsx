import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ReactionButtons } from '@/components/shared/ReactionButtons';
import { CommentSection } from '@/components/shared/CommentSection';
import { TiptapEditor } from '@/components/shared/TiptapEditor';
import { mockMemos } from '@/lib/mock-data';
import { formatDistanceToNow, format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Plus } from 'lucide-react';

export default function MemoDetail() {
  const { id } = useParams();
  const memo = mockMemos.find(m => m.id === id) || mockMemos[0];
  const authorName = memo.is_anonymous ? '名無しエンジニア' : memo.author.display_name;
  const [newEntry, setNewEntry] = useState('');
  const [showNewEntry, setShowNewEntry] = useState(false);

  return (
    <MainLayout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-3">{memo.title}</h1>
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">{authorName[0]}</AvatarFallback>
          </Avatar>
          <Link to={`/users/${memo.author.username}`} className="text-sm font-medium hover:text-primary">{authorName}</Link>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(memo.created_at), { locale: ja, addSuffix: true })}
          </span>
        </div>
        <div className="flex gap-2 mb-6 flex-wrap">
          {memo.tags.map(tag => <Badge key={tag.id} variant="secondary">{tag.name}</Badge>)}
        </div>

        {/* Entries (thread-style) */}
        <div className="space-y-4 mb-6">
          {memo.entries.map((entry, i) => (
            <div key={entry.id} className="relative pl-6 border-l-2 border-primary/20">
              <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-primary/40" />
              <p className="text-xs text-muted-foreground mb-2">
                {format(new Date(entry.created_at), 'yyyy/MM/dd HH:mm', { locale: ja })}
              </p>
              <div className="prose prose-sm max-w-none bg-card p-4 rounded-lg border" dangerouslySetInnerHTML={{ __html: entry.content }} />
            </div>
          ))}
        </div>

        {/* Add new entry */}
        {!showNewEntry ? (
          <Button variant="outline" className="gap-1 mb-6" onClick={() => setShowNewEntry(true)}>
            <Plus className="h-4 w-4" /> エントリを追加
          </Button>
        ) : (
          <div className="space-y-2 mb-6">
            <TiptapEditor content={newEntry} onChange={setNewEntry} placeholder="新しいエントリを追加..." />
            <div className="flex gap-2">
              <Button size="sm">追加する</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewEntry(false)}>キャンセル</Button>
            </div>
          </div>
        )}

        <ReactionButtons reactions={memo.reactions} />
        <Separator className="my-8" />
        <CommentSection contentType="memo" contentId={memo.id} />
      </div>
    </MainLayout>
  );
}
