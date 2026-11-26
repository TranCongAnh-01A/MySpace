import { computeReorder } from './reorder';

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('computeReorder', () => {
  it('kéo xuống: before là mục nằm trên, after là mục nằm dưới sau khi đổi chỗ', () => {
    const r = computeReorder(items, 'a', 'c');
    expect(r?.next.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(r?.beforeId).toBe('c');
    expect(r?.afterId).toBe('d');
  });

  it('kéo lên đầu danh sách: chỉ có afterId', () => {
    const r = computeReorder(items, 'c', 'a');
    expect(r?.next.map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(r?.beforeId).toBeUndefined();
    expect(r?.afterId).toBe('a');
  });

  it('kéo xuống cuối: chỉ có beforeId', () => {
    const r = computeReorder(items, 'a', 'd');
    expect(r?.beforeId).toBe('d');
    expect(r?.afterId).toBeUndefined();
  });

  it('thả tại chỗ hoặc id lạ thì không làm gì', () => {
    expect(computeReorder(items, 'a', 'a')).toBeNull();
    expect(computeReorder(items, 'a', 'zz')).toBeNull();
  });
});
