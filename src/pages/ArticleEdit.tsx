import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TagInput } from '@/components/shared/TagInput';
import { TiptapEditor } from '@/components/shared/TiptapEditor';
import { mockArticles } from '@/lib/mock-data';
import type { Tag } from '@/types';

export default function ArticleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const article = mockArticles.find(a => a.id === id) || mockArticles[0];
  const [title, setTitle] = useState(article.title);
  const [content, setContent] = useState(article.content);
  const [tags, setTags] = useState<Tag[]>(article.tags);
  const [isAnonymous, setIsAnonymous] = useState(article.is_anonymous);

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">📄 記事を編集</h1>
        <div className="space-y-4">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル" className="text-xl font-semibold h-12" />
          <div className="space-y-2">
            <Label>タグ</Label>
            <TagInput selectedTags={tags} onChange={setTags} />
          </div>
          <TiptapEditor content={content} onChange={setContent} />
          <div className="flex items-center gap-2">
            <Switch id="anon" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
            <Label htmlFor="anon">匿名で投稿する</Label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>キャンセル</Button>
            <Button variant="secondary">下書き保存</Button>
            <Button>更新する</Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
