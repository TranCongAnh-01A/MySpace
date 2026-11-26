import { computeMoveTarget, columnId, type Columns } from './moveTarget';

const cols: Columns = {
  Todo: ['a', 'b', 'c'],
  InProgress: ['d', 'e'],
  Review: [],
  Done: ['f'],
};

describe('computeMoveTarget (beforeId/afterId trong cột đích)', () => {
  it('kéo xuống trong cùng cột: đặt sau thẻ đích', () => {
    expect(computeMoveTarget(cols, 'a', 'b')).toEqual({
      status: 'Todo',
      beforeId: 'b',
      afterId: 'c',
    });
    expect(computeMoveTarget(cols, 'a', 'c')).toEqual({ status: 'Todo', beforeId: 'c' });
  });

  it('kéo lên trong cùng cột: đặt trước thẻ đích', () => {
    expect(computeMoveTarget(cols, 'c', 'b')).toEqual({
      status: 'Todo',
      beforeId: 'a',
      afterId: 'b',
    });
    expect(computeMoveTarget(cols, 'c', 'a')).toEqual({ status: 'Todo', afterId: 'a' });
  });

  it('sang cột khác: đặt trước thẻ đích', () => {
    expect(computeMoveTarget(cols, 'a', 'e')).toEqual({
      status: 'InProgress',
      beforeId: 'd',
      afterId: 'e',
    });
    expect(computeMoveTarget(cols, 'a', 'd')).toEqual({ status: 'InProgress', afterId: 'd' });
  });

  it('thả vào vùng trống của cột: xuống cuối cột (hoặc cột rỗng thì không có thẻ kề)', () => {
    expect(computeMoveTarget(cols, 'a', columnId('InProgress'))).toEqual({
      status: 'InProgress',
      beforeId: 'e',
    });
    expect(computeMoveTarget(cols, 'a', columnId('Review'))).toEqual({ status: 'Review' });
  });

  it('thả lên chính nó thì không làm gì', () => {
    expect(computeMoveTarget(cols, 'a', 'a')).toBeNull();
  });
});
