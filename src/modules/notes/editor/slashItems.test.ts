import { describe, expect, it } from 'vitest';
import { translate } from '@/lib/i18n';
import { SLASH_ITEMS, filterSlashItems } from './slashItems';

const label = (k: Parameters<typeof translate>[1]) => translate('vi', k);
const ids = (q: string) => filterSlashItems(SLASH_ITEMS, q, label).map((i) => i.id);

describe('lọc slash command', () => {
  it('rỗng thì trả đủ 10 mục theo thứ tự plan', () => {
    expect(ids('')).toEqual([
      'text',
      'h1',
      'h2',
      'h3',
      'bullet',
      'ordered',
      'task',
      'code',
      'quote',
      'divider',
    ]);
  });
  it('không phân biệt dấu và hoa thường', () => {
    expect(ids('tieu de')).toEqual(['h1', 'h2', 'h3']);
    expect(ids('TIÊU ĐỀ 2')).toEqual(['h2']);
    expect(ids('duong ke')).toEqual(['divider']);
    expect(ids('trich')).toEqual(['quote']);
    expect(ids('danh sach so')).toEqual(['ordered']);
  });
  it('gõ tiếng Anh cũng ra', () => {
    expect(ids('check')).toEqual(['task']);
    expect(ids('zzz')).toEqual([]);
  });
});
