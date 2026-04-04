import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { mockTags } from '@/lib/mock-data';
import type { Tag } from '@/types';

interface TagInputProps {
  selectedTags: Tag[];
  onChange: (tags: Tag[]) => void;
  placeholder?: string;
}

export function TagInput({ selectedTags, onChange, placeholder = 'タグを追加...' }: TagInputProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = mockTags.filter(
    t => t.name.toLowerCase().includes(query.toLowerCase()) && !selectedTags.find(s => s.id === t.id)
  ).slice(0, 5);

  const addTag = (tag: Tag) => {
    onChange([...selectedTags, tag]);
    setQuery('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tagId: string) => {
    onChange(selectedTags.filter(t => t.id !== tagId));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      const existing = mockTags.find(t => t.name.toLowerCase() === query.toLowerCase());
      if (existing) {
        addTag(existing);
      } else {
        addTag({ id: `new-${Date.now()}`, name: query.trim() });
      }
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center border rounded-md p-2 bg-background">
        {selectedTags.map(tag => (
          <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
            {tag.name}
            <button onClick={() => removeTag(tag.id)} className="hover:bg-foreground/10 rounded-full p-0.5">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] border-0 p-0 h-7 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      {showSuggestions && query && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-card border rounded-md shadow-md py-1">
          {suggestions.map(tag => (
            <button key={tag.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted" onMouseDown={() => addTag(tag)}>
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
