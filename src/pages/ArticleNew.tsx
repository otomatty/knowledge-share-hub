import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TagInput } from '@/components/shared/TagInput';
import { TiptapEditor } from '@/components/shared/TiptapEditor';
import type { Tag } from '@/types';

export default function ArticleNew() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">📄 記事を作成</h1>
        <div className="space-y-4">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル" className="text-xl font-semibold h-12" />
          <div className="space-y-2">
            <Label>タグ</Label>
            <TagInput selectedTags={tags} onChange={setTags} />
          </div>
          <TiptapEditor content={content} onChange={setContent} placeholder="記事の本文を入力..." />
          <div className="flex items-center gap-2">
            <Switch id="anon" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
            <Label htmlFor="anon">匿名で投稿する</Label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>キャンセル</Button>
            <Button variant="secondary">下書き保存</Button>
            <Button disabled={!title.trim()}>公開する</Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
