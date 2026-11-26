// Bản TS của bộ kiểm tra nội dung Note ở core (B5 mục 2.2). Dùng cho test và mock; core vẫn là lớp phòng thủ thứ hai.

export const ALLOWED_NODES: ReadonlySet<string> = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'hardBreak',
]);
export const ALLOWED_MARKS: ReadonlySet<string> = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
]);
export const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 300;
const MAX_DEPTH = 64;

const BLOCKS_WITH_BREAK: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'listItem',
  'taskItem',
  'codeBlock',
  'blockquote',
]);

/** Giao thức link được phép. */
export const isSafeHref = (href: unknown): href is string =>
  typeof href === 'string' && /^(https?:\/\/|mailto:)/i.test(href.trim());

export const EMPTY_DOC = '{"type":"doc","content":[{"type":"paragraph"}]}';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export type Validation = { ok: true } | { ok: false; reason: string };

function checkNode(node: unknown, depth: number): string | null {
  if (!isObj(node) || typeof node.type !== 'string') return 'node';
  const type = node.type;
  if (!ALLOWED_NODES.has(type) || depth > MAX_DEPTH) return type;
  const attrs = isObj(node.attrs) ? node.attrs : {};
  if (type === 'heading') {
    const lv = attrs.level;
    if (typeof lv !== 'number' || ![1, 2, 3].includes(lv)) return type;
  }
  if (type === 'taskItem' && attrs.checked !== undefined && typeof attrs.checked !== 'boolean')
    return type;
  if (type === 'codeBlock') {
    const lang = attrs.language;
    if (lang != null && (typeof lang !== 'string' || !/^[a-z0-9+#-]{1,30}$/.test(lang)))
      return type;
  }
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) return type;
    for (const m of node.marks) {
      if (!isObj(m) || typeof m.type !== 'string' || !ALLOWED_MARKS.has(m.type))
        return isObj(m) && typeof m.type === 'string' ? m.type : 'mark';
      if (m.type === 'link') {
        const href = isObj(m.attrs) ? m.attrs.href : undefined;
        if (!isSafeHref(href)) return 'link';
      }
    }
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) return type;
    for (const child of node.content) {
      const bad = checkNode(child, depth + 1);
      if (bad) return bad;
    }
  }
  return null;
}

/** Hàm thuần: JSON hợp lệ, gốc `doc`, chỉ chứa node/mark/attr được phép, ≤ 2 MB. */
export function validateNoteContent(contentJson: string): Validation {
  if (new TextEncoder().encode(contentJson).length > MAX_CONTENT_BYTES)
    return { ok: false, reason: 'size' };
  let doc: unknown;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isObj(doc) || doc.type !== 'doc') return { ok: false, reason: 'doc' };
  const bad = checkNode(doc, 0);
  return bad ? { ok: false, reason: bad } : { ok: true };
}

/** Nối các `text`, chèn `\n` giữa các block. */
export function extractSearchText(contentJson: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return '';
  }
  let out = '';
  const walk = (n: unknown) => {
    if (!isObj(n)) return;
    if (typeof n.text === 'string') out += n.text;
    if (n.type === 'hardBreak') out += '\n';
    if (Array.isArray(n.content)) n.content.forEach(walk);
    if (typeof n.type === 'string' && BLOCKS_WITH_BREAK.has(n.type)) out += '\n';
  };
  walk(doc);
  return out.replace(/\n{2,}/g, '\n').trim();
}

export const excerptOf = (searchText: string): string =>
  searchText.replace(/\s*\n\s*/g, ' ').slice(0, 160);

/** Nội dung Inbox → doc một đoạn văn (xuống dòng thành hardBreak). */
export function paragraphDoc(text: string): string {
  const content: Json[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' });
    if (line) content.push({ type: 'text', text: line });
  });
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content }] });
}
