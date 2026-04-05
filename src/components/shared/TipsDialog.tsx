import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { mockTags } from '@/lib/mock-data';

interface TipsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TipsDialog({ open, onOpenChange }: TipsDialogProps) {
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
  };

  const handleSubmit = () => {
    if (!content.trim()) return;
    setContent('');
    setSelectedTags([]);
    setIsAnonymous(false);
    onOpenChange(false);
  };

  const remaining = 280 - content.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            💬 Tipsを投稿
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, 280))}
              placeholder="学んだこと、気づいたことをシェアしよう..."
              className="w-full min-h-[120px] resize-none rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <span className={`absolute bottom-2 right-3 text-xs ${remaining < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {remaining}
            </span>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">タグ（任意）</p>
            <div className="flex flex-wrap gap-1.5">
              {mockTags.slice(0, 8).map(tag => (
                <Badge
                  key={tag.id}
                  variant={selectedTags.includes(tag.name) ? 'default' : 'secondary'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleTag(tag.name)}
                >
                  {tag.name}
                  {selectedTags.includes(tag.name) && <X className="h-3 w-3 ml-1" />}
                </Badge>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={e => setIsAnonymous(e.target.checked)}
              className="rounded border-muted-foreground"
            />
            匿名で投稿する
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!content.trim()}>
              投稿する
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
