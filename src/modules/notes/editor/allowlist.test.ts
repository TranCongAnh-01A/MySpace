import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { translate } from '@/lib/i18n';
import {
  ALLOWED_MARKS,
  ALLOWED_NODES,
  excerptOf,
  extractSearchText,
  paragraphDoc,
  validateNoteContent,
} from './allowlist';
import { buildExtensions } from './extensions';
import { sanitizePastedHtml } from './sanitize';

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
  translate('vi', k, v);
const doc = (...content: object[]) => JSON.stringify({ type: 'doc', content });
const p = (text: string, marks?: object[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

describe('validateNoteContent (khớp bộ kiểm tra của B5)', () => {
  it('nhận mọi node/mark được phép', () => {
    const json = doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] },
      p('đậm', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://a.com' } }]),
      {
        type: 'taskList',
        content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('x')] }],
      },
      { type: 'codeBlock', attrs: { language: 'c++' }, content: [{ type: 'text', text: 'a' }] },
      { type: 'codeBlock', attrs: { language: null } },
      { type: 'blockquote', content: [p('q')] },
      { type: 'horizontalRule' },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('a')] }] },
    );
    expect(validateNoteContent(json)).toEqual({ ok: true });
  });

  it('từ chối node, mark và attr ngoài danh sách', () => {
    expect(validateNoteContent(doc({ type: 'image', attrs: { src: 'x' } }))).toEqual({
      ok: false,
      reason: 'image',
    });
    expect(validateNoteContent(doc(p('a', [{ type: 'underline' }])))).toMatchObject({ ok: false });
    expect(
      validateNoteContent(doc({ type: 'heading', attrs: { level: 4 }, content: [] })),
    ).toMatchObject({ ok: false });
    expect(
      validateNoteContent(doc({ type: 'codeBlock', attrs: { language: 'Ba D!' } })),
    ).toMatchObject({ ok: false });
  });

  it('từ chối link javascript:, data:, và JSON/gốc sai', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'tel:1']) {
      expect(validateNoteContent(doc(p('a', [{ type: 'link', attrs: { href } }])))).toEqual({
        ok: false,
        reason: 'link',
      });
    }
    expect(validateNoteContent('không phải json')).toEqual({ ok: false, reason: 'json' });
    expect(validateNoteContent('{"type":"paragraph"}')).toEqual({ ok: false, reason: 'doc' });
  });

  it('mailto được phép', () => {
    expect(
      validateNoteContent(doc(p('a', [{ type: 'link', attrs: { href: 'mailto:a@b.c' } }]))),
    ).toEqual({ ok: true });
  });
});

describe('extractSearchText / excerpt', () => {
  it('nối text, chèn xuống dòng giữa các block', () => {
    const json = doc(
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Ghi chú' }] },
      p('nội dung'),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('một')] }] },
    );
    expect(extractSearchText(json)).toBe('Ghi chú\nnội dung\nmột');
    expect(excerptOf('a\nb')).toBe('a b');
    expect(excerptOf('x'.repeat(300))).toHaveLength(160);
  });
  it('paragraphDoc hợp lệ', () => {
    expect(validateNoteContent(paragraphDoc('dòng 1\ndòng 2'))).toEqual({ ok: true });
  });
});

describe('Editor chỉ sinh ra node/mark được phép', () => {
  const run = (html: string) => {
    const editor = new Editor({
      extensions: buildExtensions(t, { slash: false }),
      content: sanitizePastedHtml(html),
    });
    const json = editor.getJSON();
    editor.destroy();
    return JSON.stringify(json);
  };

  it('danh sách extension khớp allowlist', () => {
    const editor = new Editor({ extensions: buildExtensions(t, { slash: false }) });
    const nodes = Object.keys(editor.schema.nodes).filter((n) => n !== 'text');
    const marks = Object.keys(editor.schema.marks);
    editor.destroy();
    for (const n of nodes) expect(ALLOWED_NODES.has(n), `node ${n}`).toBe(true);
    for (const m of marks) expect(ALLOWED_MARKS.has(m), `mark ${m}`).toBe(true);
  });

  it('dán HTML có <script>, onclick, style: bị loại bỏ', () => {
    const html =
      '<p onclick="steal()" style="color:red">Xin chào <a href="javascript:alert(1)" onmouseover="x()">xấu</a> ' +
      '<a href="https://ok.com">tốt</a></p>' +
      '<script>alert(1)</script><style>p{display:none}</style><iframe src="https://evil"></iframe>' +
      '<img src="x" onerror="alert(1)"><table><tr><td>ô</td></tr></table><u>gạch chân</u>' +
      '<h5>h5</h5>';
    const sanitized = sanitizePastedHtml(html);
    expect(sanitized).not.toMatch(/<script|<style|<iframe|onclick|onerror|onmouseover|style=/i);

    const json = run(html);
    expect(validateNoteContent(json)).toEqual({ ok: true });
    expect(json).not.toMatch(/javascript:|alert|steal|image|table|underline/);
    expect(json).toContain('https://ok.com');
    expect(json).toContain('Xin chào');
  });

  it('link scheme lạ không thành mark', () => {
    const json = run('<p><a href="data:text/html;base64,xx">a</a><a href="ftp://x.y">b</a></p>');
    expect(json).not.toContain('"link"');
  });
});
