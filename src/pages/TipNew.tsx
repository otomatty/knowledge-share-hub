import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { TagInput } from '@/components/shared/TagInput';
import type { Tag } from '@/types';

export default function TipNew() {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/tips');
  };

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">💬 Tips を投稿する</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>ひとこと（最大100文字）</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, 100))}
              placeholder="今日ハマったこと、便利コマンド、ちょっとした気づきなど..."
              className="resize-none h-24"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground text-right">{content.length}/100</p>
          </div>
          <div className="space-y-2">
            <Label>タグ</Label>
            <TagInput selectedTags={tags} onChange={setTags} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="anonymous" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
            <Label htmlFor="anonymous">匿名で投稿する</Label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!content.trim()}>投稿する</Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>キャンセル</Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
