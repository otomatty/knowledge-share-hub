import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', display_name: '', password: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/');
  };

  const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-3xl mb-2">📚</div>
          <CardTitle className="text-2xl">KnowledgeHub</CardTitle>
          <CardDescription>アカウントを作成してナレッジ共有を始めましょう</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">表示名</Label>
              <Input id="display_name" value={form.display_name} onChange={e => update('display_name', e.target.value)} placeholder="田中太郎" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">ユーザー名</Label>
              <Input id="username" value={form.username} onChange={e => update('username', e.target.value)} placeholder="tanaka" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input id="email" type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input id="password" type="password" value={form.password} onChange={e => update('password', e.target.value)} placeholder="8文字以上" required />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full">アカウント作成</Button>
            <p className="text-sm text-muted-foreground">
              すでにアカウントをお持ちの方は <Link to="/login" className="text-primary hover:underline">ログイン</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
