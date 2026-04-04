import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TagInput } from '@/components/shared/TagInput';
import { currentUser, mockTags } from '@/lib/mock-data';
import type { Tag } from '@/types';
import { Camera } from 'lucide-react';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    display_name: currentUser.display_name,
    current_project: currentUser.current_project || '',
    bio: currentUser.bio || '',
  });
  const [skillTags, setSkillTags] = useState<Tag[]>(
    currentUser.skill_tags.map(name => {
      const found = mockTags.find(t => t.name === name);
      return found || { id: `st-${name}`, name };
    })
  );

  const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <MainLayout showSidebar={false}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">プロフィール設定</h1>
        <div className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">{form.display_name[0]}</AvatarFallback>
              </Avatar>
              <button className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 shadow">
                <Camera className="h-3 w-3" />
              </button>
            </div>
            <div>
              <p className="font-medium">{form.display_name}</p>
              <p className="text-sm text-muted-foreground">@{currentUser.username}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>表示名</Label>
            <Input value={form.display_name} onChange={e => update('display_name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>現在の案件</Label>
            <Input value={form.current_project} onChange={e => update('current_project', e.target.value)} placeholder="例: 金融系Webアプリ開発" />
          </div>
          <div className="space-y-2">
            <Label>スキルタグ</Label>
            <TagInput selectedTags={skillTags} onChange={setSkillTags} placeholder="スキルを追加..." />
          </div>
          <div className="space-y-2">
            <Label>自己紹介（200文字以内）</Label>
            <Textarea value={form.bio} onChange={e => update('bio', e.target.value.slice(0, 200))} className="h-24 resize-none" />
            <p className="text-xs text-muted-foreground text-right">{form.bio.length}/200</p>
          </div>
          <div className="flex gap-2">
            <Button>保存する</Button>
            <Button variant="outline" onClick={() => navigate(-1)}>キャンセル</Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
