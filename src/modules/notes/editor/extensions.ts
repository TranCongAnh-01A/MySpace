import type { Extensions } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import type { TFunction } from '@/lib/i18n';
import { isSafeHref } from './allowlist';
import { CodeBlockView } from './CodeBlockView';
import { createSlashExtension } from './SlashMenu';

const lowlight = createLowlight(common);

const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

/**
 * Danh sách extension khớp đúng allowlist của B5 (`allowlist.ts`):
 * node: doc, paragraph, heading 1–3, text, bulletList, orderedList, listItem, taskList, taskItem,
 * codeBlock, blockquote, horizontalRule, hardBreak; mark: bold, italic, strike, code, link.
 * Chỉ extension MIT (không dùng Tiptap Pro).
 */
export function buildExtensions(t: TFunction, opts: { slash?: boolean } = {}): Extensions {
  const exts: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      underline: false,
      link: false,
    }),
    CodeBlock.configure({ lowlight, defaultLanguage: null }),
    TaskList,
    TaskItem.configure({
      nested: true,
      a11y: { checkboxLabel: (node) => t('notes.taskCheckbox', { text: node.textContent }) },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['mailto'],
      validate: (url) => isSafeHref(url),
      isAllowedUri: (url) => isSafeHref(url),
    }),
    Placeholder.configure({ placeholder: t('notes.placeholder') }),
  ];
  if (opts.slash !== false) exts.push(createSlashExtension(t));
  return exts;
}
