const DROP_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'];

/**
 * Làm sạch HTML trước khi Tiptap parse (spec 9.2): gỡ thẻ nguy hiểm, mọi thuộc tính `on*` và `style`.
 * Schema Tiptap sẽ tự bỏ những node không khai báo; HTML thô không bao giờ được render.
 */
export function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(DROP_TAGS.join(',')).forEach((el) => el.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style') el.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}
