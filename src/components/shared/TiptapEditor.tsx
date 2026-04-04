import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Code, Quote, Link as LinkIcon, ImageIcon, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface TiptapEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minimal?: boolean;
}

export function TiptapEditor({ content = '', onChange, placeholder = '本文を入力...', minimal = false }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  if (!editor) return null;

  const ToolButton = ({ onClick, active, children, title }: { onClick: () => void; active?: boolean; children: React.ReactNode; title: string }) => (
    <Button variant={active ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={onClick} title={title} type="button">
      {children}
    </Button>
  );

  return (
    <div className="tiptap-editor border rounded-lg overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30 flex-wrap">
        {!minimal && (
          <>
            <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="見出し2">
              <Heading1 className="h-4 w-4" />
            </ToolButton>
            <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="見出し3">
              <Heading2 className="h-4 w-4" />
            </ToolButton>
            <Separator orientation="vertical" className="h-6 mx-0.5" />
          </>
        )}
        <ToolButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="太字">
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体">
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="コード">
          <Code className="h-4 w-4" />
        </ToolButton>
        {!minimal && (
          <>
            <Separator orientation="vertical" className="h-6 mx-0.5" />
            <ToolButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="箇条書き">
              <List className="h-4 w-4" />
            </ToolButton>
            <ToolButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="番号リスト">
              <ListOrdered className="h-4 w-4" />
            </ToolButton>
            <ToolButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
              <Quote className="h-4 w-4" />
            </ToolButton>
            <Separator orientation="vertical" className="h-6 mx-0.5" />
            <ToolButton onClick={() => {
              const url = window.prompt('URL');
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }} active={editor.isActive('link')} title="リンク">
              <LinkIcon className="h-4 w-4" />
            </ToolButton>
            <ToolButton onClick={() => {
              const url = window.prompt('画像URL');
              if (url) editor.chain().focus().setImage({ src: url }).run();
            }} title="画像">
              <ImageIcon className="h-4 w-4" />
            </ToolButton>
          </>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton onClick={() => editor.chain().focus().undo().run()} title="元に戻す">
            <Undo className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={() => editor.chain().focus().redo().run()} title="やり直す">
            <Redo className="h-4 w-4" />
          </ToolButton>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
