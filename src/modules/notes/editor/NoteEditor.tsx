import { useMemo, useState, type FormEvent } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Code, Italic, Link2, Strikethrough } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EMPTY_DOC, isSafeHref } from './allowlist';
import { buildExtensions } from './extensions';
import { sanitizePastedHtml } from './sanitize';

function parseContent(contentJson: string): object {
  try {
    const v: unknown = JSON.parse(contentJson);
    if (typeof v === 'object' && v !== null) return v;
  } catch {
    /* rơi xuống nội dung rỗng */
  }
  return JSON.parse(EMPTY_DOC) as object;
}

/** Thêm `https://` khi người dùng chỉ nhập tên miền; trả `null` nếu scheme không được phép. */
export function normalizeHref(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  return isSafeHref(withScheme) ? withScheme : null;
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // mousedown giữ vùng chọn trong editor
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded text-text hover:bg-border/60 [&_svg]:size-4',
        active && 'bg-border text-primary',
      )}
    >
      {children}
    </button>
  );
}

function BubbleToolbar({ editor }: { editor: Editor }) {
  const t = useT();
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [invalid, setInvalid] = useState(false);
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      empty: e.state.selection.empty,
    }),
  });
  if (active.empty && linkOpen) setLinkOpen(false); // bỏ chọn chữ thì đóng ô nhập link

  const openLink = () => {
    setHref((editor.getAttributes('link').href as string | undefined) ?? '');
    setInvalid(false);
    setLinkOpen(true);
  };
  const applyLink = (e: FormEvent) => {
    e.preventDefault();
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const url = normalizeHref(href);
    if (!url) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkOpen(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top' }}
      shouldShow={({ editor: e, state }) =>
        e.isEditable && !state.selection.empty && !e.isActive('codeBlock')
      }
    >
      <div
        role="toolbar"
        aria-label={t('notes.format')}
        className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1 shadow-md"
      >
        {linkOpen ? (
          <form onSubmit={applyLink} className="flex items-center gap-1">
            <input
              autoFocus
              aria-label={t('notes.linkUrl')}
              aria-invalid={invalid}
              placeholder="https://"
              value={href}
              onChange={(e) => {
                setHref(e.target.value);
                setInvalid(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setLinkOpen(false);
                  editor.commands.focus();
                }
              }}
              className={cn(
                'h-8 w-56 rounded border bg-bg px-2 text-sm text-text',
                invalid ? 'border-danger' : 'border-border',
              )}
            />
            {invalid && (
              <span role="alert" className="px-1 text-xs text-danger">
                {t('notes.linkInvalid')}
              </span>
            )}
            <button type="submit" className="h-8 rounded bg-primary px-2 text-sm text-primary-fg">
              {t('common.save')}
            </button>
          </form>
        ) : (
          <>
            <ToolButton
              label={t('notes.bold')}
              active={active.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold />
            </ToolButton>
            <ToolButton
              label={t('notes.italic')}
              active={active.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic />
            </ToolButton>
            <ToolButton
              label={t('notes.strike')}
              active={active.strike}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough />
            </ToolButton>
            <ToolButton
              label={t('notes.inlineCode')}
              active={active.code}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <Code />
            </ToolButton>
            <ToolButton label={t('notes.link')} active={active.link} onClick={openLink}>
              <Link2 />
            </ToolButton>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}

/**
 * Editor Tiptap. `initialContent` chỉ dùng lúc mount (đổi Note thì remount bằng `key`).
 * `onChange` nhận chuỗi JSON `JSON.stringify(editor.getJSON())`.
 */
export function NoteEditor({
  initialContent,
  onChange,
  onReady,
  ariaLabel,
}: {
  initialContent: string;
  onChange: (contentJson: string) => void;
  onReady?: (editor: Editor) => void;
  ariaLabel: string;
}) {
  const t = useT();
  const [content] = useState(() => parseContent(initialContent));
  const extensions = useMemo(() => buildExtensions(t), [t]);
  const editor = useEditor(
    {
      extensions,
      content,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': ariaLabel,
          class: 'note-prose focus:outline-none',
        },
        transformPastedHTML: sanitizePastedHtml,
      },
      onCreate: ({ editor: e }) => onReady?.(e),
      onUpdate: ({ editor: e }) => onChange(JSON.stringify(e.getJSON())),
    },
    [extensions],
  );

  if (!editor) return null;
  return (
    <>
      <BubbleToolbar editor={editor} />
      <EditorContent editor={editor} />
    </>
  );
}
