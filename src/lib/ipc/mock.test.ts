import { addDays } from '@/lib/tz';
import type { Recurrence } from './contract';
import {
  mockInboxConvertToTask,
  mockInboxList,
  mockSearch,
  mockTaskCreate,
  mockTaskList,
  mockTaskSetStatus,
  mockTaskUpdate,
  nextOccurrence,
} from './mock';

describe('nextOccurrence', () => {
  it('Daily và Weekly không có thứ', () => {
    expect(nextOccurrence('2026-11-26', { frequency: 'Daily', interval: 3 })).toBe('2026-11-29');
    expect(nextOccurrence('2026-11-26', { frequency: 'Weekly', interval: 2 })).toBe('2026-12-10');
  });

  it('Weekly có byWeekday: ngày gần nhất còn lại trong tuần, hết tuần thì nhảy interval tuần', () => {
    // 2026-11-26 là thứ Năm
    const rec: Recurrence = { frequency: 'Weekly', interval: 1, byWeekday: ['Mo', 'Fr'] };
    expect(nextOccurrence('2026-11-26', rec)).toBe('2026-11-27'); // thứ Sáu
    expect(nextOccurrence('2026-11-27', rec)).toBe('2026-11-30'); // thứ Hai tuần sau
  });

  it('Monthly giữ ngày, tháng ngắn thì lấy ngày cuối tháng', () => {
    expect(nextOccurrence('2026-01-31', { frequency: 'Monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextOccurrence('2026-12-15', { frequency: 'Monthly', interval: 2 })).toBe('2027-02-15');
  });
});

describe('mock quy tắc B2', () => {
  it('Done một Task lặp sinh lần tiếp theo; mở lại thì xoá completedAt', async () => {
    const task = await mockTaskCreate({
      title: 'Lặp thử',
      dueDate: '2026-11-26',
      recurrence: { frequency: 'Daily', interval: 1 },
    });
    const done = await mockTaskSetStatus(task.id, 'Done');
    expect(done.task.completedAt).toBeDefined();
    expect(done.next?.dueDate).toBe('2026-11-27');
    const reopened = await mockTaskSetStatus(task.id, 'Todo');
    expect(reopened.task.completedAt).toBeUndefined();
  });

  it('Task lặp cần có hạn; có cả dueDate và dueAt thì VALIDATION', async () => {
    await expect(
      mockTaskCreate({ title: 'x', recurrence: { frequency: 'Daily', interval: 1 } }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      mockTaskCreate({ title: 'x', dueDate: '2026-11-26', dueAt: '2026-11-26T01:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('task_update lệch baseVersion thì CONFLICT', async () => {
    const task = await mockTaskCreate({ title: 'Phiên bản' });
    await mockTaskUpdate(task.id, { title: 'Mới' }, task.version);
    await expect(mockTaskUpdate(task.id, { title: 'Cũ' }, task.version)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('chuyển Inbox hai lần thì lần hai CONFLICT', async () => {
    const open = (await mockInboxList('Open'))[0];
    expect(open).toBeDefined();
    await mockInboxConvertToTask(open?.id ?? '', { title: 'Từ inbox' });
    await expect(mockInboxConvertToTask(open?.id ?? '', { title: 'Lại' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('lọc theo hạn và tìm kiếm không dấu', async () => {
    const t = await mockTaskCreate({ title: 'Đặt lịch họp', dueDate: addDays('2026-01-01', 0) });
    const overdue = await mockTaskList({ due: 'Overdue' });
    expect(overdue.some((x) => x.id === t.id)).toBe(true);
    const hits = await mockSearch('dat lich hop');
    expect(hits.some((h) => h.id === t.id)).toBe(true);
  });
});
