import { buildTasksSearch, parseTasksQuery } from './filters';

describe('bộ lọc Tasks trên URL', () => {
  it('đọc view, due, status, priority, tag, area, sort', () => {
    const q = parseTasksQuery(
      new URLSearchParams(
        'view=board&due=Overdue&status=Todo,Review&priority=High&tag=t1&area=a1&sort=DueDate&archived=1',
      ),
    );
    expect(q.view).toBe('board');
    expect(q.filter).toEqual({
      due: 'Overdue',
      status: ['Todo', 'Review'],
      priority: ['High'],
      tagId: 't1',
      areaId: 'a1',
      sort: 'DueDate',
      archived: true,
    });
  });

  it('bỏ qua giá trị không hợp lệ, mặc định là list', () => {
    const q = parseTasksQuery(new URLSearchParams('view=x&due=Foo&status=Nope&sort=Random'));
    expect(q).toEqual({ view: 'list', filter: {} });
  });

  it('ghi lại URL và đọc ngược cho kết quả như cũ', () => {
    const q = parseTasksQuery(new URLSearchParams('due=Today&status=Done&view=board'));
    const s = buildTasksSearch(q);
    expect(parseTasksQuery(new URLSearchParams(s.slice(1)))).toEqual(q);
    expect(buildTasksSearch({ view: 'list', filter: {} })).toBe('');
  });
});
