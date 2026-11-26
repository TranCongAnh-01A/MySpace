import type { Editor, Range } from '@tiptap/core';
import { foldText } from '@/lib/format/text';
import type { TKey } from '@/lib/i18n';

export type SlashItem = {
  id: string;
  /** Khoá i18n của nhãn. */
  label: TKey;
  /** Từ khoá bổ sung (không dấu) để lọc. */
  keywords: string;
  run: (editor: Editor, range: Range) => void;
};

const start = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'text',
    label: 'notes.slash.text',
    keywords: 'paragraph van ban text',
    run: (e, r) => start(e, r).clearNodes().run(),
  },
  {
    id: 'h1',
    label: 'notes.slash.h1',
    keywords: 'heading 1 h1 tieu de',
    run: (e, r) => start(e, r).setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'notes.slash.h2',
    keywords: 'heading 2 h2 tieu de',
    run: (e, r) => start(e, r).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'notes.slash.h3',
    keywords: 'heading 3 h3 tieu de',
    run: (e, r) => start(e, r).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: 'notes.slash.bullet',
    keywords: 'bullet list danh sach',
    run: (e, r) => start(e, r).toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'notes.slash.ordered',
    keywords: 'number ordered list danh sach so',
    run: (e, r) => start(e, r).toggleOrderedList().run(),
  },
  {
    id: 'task',
    label: 'notes.slash.task',
    keywords: 'todo task checklist checkbox',
    run: (e, r) => start(e, r).toggleTaskList().run(),
  },
  {
    id: 'code',
    label: 'notes.slash.code',
    keywords: 'code block ma',
    run: (e, r) => start(e, r).setCodeBlock().run(),
  },
  {
    id: 'quote',
    label: 'notes.slash.quote',
    keywords: 'quote blockquote trich dan',
    run: (e, r) => start(e, r).setBlockquote().run(),
  },
  {
    id: 'divider',
    label: 'notes.slash.divider',
    keywords: 'divider horizontal rule duong ke',
    run: (e, r) => start(e, r).setHorizontalRule().run(),
  },
];

/** Lọc không phân biệt dấu theo nhãn đã dịch và từ khoá. */
export function filterSlashItems(
  items: SlashItem[],
  query: string,
  label: (key: TKey) => string,
): SlashItem[] {
  const q = foldText(query).trim();
  if (!q) return items;
  return items.filter((i) => foldText(`${label(i.label)} ${i.keywords}`).includes(q));
}
