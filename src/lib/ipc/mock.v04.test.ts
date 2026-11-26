import {
  mockCalendarRange,
  mockDashboardToday,
  mockEventCreate,
  mockEventDelete,
  mockEventUpdate,
  mockReminderDismiss,
  mockReminderDismissAll,
  mockReminderList,
  mockReminderMissedList,
  mockReminderSet,
  mockSeedDemoData,
  mockTaskCreate,
  mockTaskDelete,
  mockTaskGet,
  mockTaskScheduleBlock,
  mockTaskSetStatus,
  mockTaskUpdate,
  mockTrashRestore,
} from './mock';

// Mock chạy trong bộ nhớ, dùng chung giữa các test trong file: mỗi test tạo dữ liệu riêng.
beforeAll(async () => {
  await mockSeedDemoData();
});

describe('mock v0.4: calendar', () => {
  it('khoảng ngày inclusive: Event có giờ chồng khoảng + Event cả ngày + deadline (gồm Task Done)', async () => {
    const day = '2031-03-10';
    const timed = await mockEventCreate({
      title: 'Họp',
      isAllDay: false,
      startAt: '2031-03-10T02:00:00.000Z',
      endAt: '2031-03-10T03:00:00.000Z',
    });
    const multi = await mockEventCreate({
      title: 'Hội thảo',
      isAllDay: true,
      startDate: '2031-03-09',
      endDate: '2031-03-10',
    });
    const done = await mockTaskCreate({ title: 'Đã xong', dueDate: day });
    await mockTaskSetStatus(done.id, 'Done');
    const items = await mockCalendarRange(day, day);
    expect(
      items.filter((i) => i.kind === 'Event').map((i) => i.kind === 'Event' && i.event.id),
    ).toEqual(expect.arrayContaining([timed.id, multi.id]));
    expect(items.some((i) => i.kind === 'Deadline' && i.task.id === done.id)).toBe(true);
    // ngày liền sau: Event cả ngày kết thúc 10/03 không còn
    const next = await mockCalendarRange('2031-03-11', '2031-03-11');
    expect(next.some((i) => i.kind === 'Event' && i.event.id === multi.id)).toBe(false);
  });

  it('validate Event: kết thúc phải sau bắt đầu; baseVersion lệch → CONFLICT', async () => {
    await expect(
      mockEventCreate({
        title: 'Sai',
        isAllDay: false,
        startAt: '2031-03-10T03:00:00.000Z',
        endAt: '2031-03-10T02:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const e = await mockEventCreate({
      title: 'A',
      isAllDay: true,
      startDate: '2031-04-01',
      endDate: '2031-04-01',
    });
    await mockEventUpdate(e.id, { title: 'B' }, e.version);
    await expect(mockEventUpdate(e.id, { title: 'C' }, e.version)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await mockEventDelete(e.id);
    expect(
      (await mockCalendarRange('2031-04-01', '2031-04-01')).some(
        (i) => i.kind === 'Event' && i.event.id === e.id,
      ),
    ).toBe(false);
  });

  it('time block: title = title của Task; xoá Task xoá mềm block + reminder Pending, khôi phục đúng mốc', async () => {
    const t = await mockTaskCreate({ title: 'Làm báo cáo', dueDate: '2031-05-05' });
    const block = await mockTaskScheduleBlock(
      t.id,
      '2031-05-05T02:00:00.000Z',
      '2031-05-05T04:00:00.000Z',
    );
    expect(block).toMatchObject({ title: 'Làm báo cáo', taskId: t.id });
    await mockReminderSet({ eventId: block.id, offsetMinutes: 10 });
    await mockTaskDelete(t.id);
    const gone = await mockCalendarRange('2031-05-05', '2031-05-05');
    expect(gone.some((i) => i.kind === 'Event' && i.event.id === block.id)).toBe(false);
    await mockTrashRestore('Task', t.id);
    const back = await mockCalendarRange('2031-05-05', '2031-05-05');
    expect(back.some((i) => i.kind === 'Event' && i.event.id === block.id)).toBe(true);
    expect(await mockReminderList(undefined, block.id)).toHaveLength(1);
  });

  it('Today có schedule của hôm nay', async () => {
    const today = await mockDashboardToday();
    expect(Array.isArray(today.schedule)).toBe(true);
  });
});

describe('mock v0.4: reminders', () => {
  it('offset cần thời điểm gốc (Task không hạn → VALIDATION); giờ cụ thể thì được', async () => {
    const t = await mockTaskCreate({ title: 'Không hạn' });
    await expect(mockReminderSet({ taskId: t.id, offsetMinutes: 15 })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    const r = await mockReminderSet({ taskId: t.id, triggerAt: '2031-06-01T01:00:00.000Z' });
    expect(r.status).toBe('Pending');
    await expect(
      mockReminderSet({ taskId: t.id, offsetMinutes: 5, triggerAt: '2031-06-01T01:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('trigger_at = gốc − offset; task_update đổi hạn thì tính lại, xoá hạn thì xoá reminder offset', async () => {
    const t = await mockTaskCreate({ title: 'Có hạn', dueAt: '2031-06-02T07:00:00.000Z' });
    const r = await mockReminderSet({ taskId: t.id, offsetMinutes: 60 });
    expect(r.triggerAt).toBe('2031-06-02T06:00:00.000Z');
    const moved = await mockTaskUpdate(t.id, { dueAt: '2031-06-03T07:00:00.000Z' }, t.version);
    expect((await mockReminderList(t.id))[0]?.triggerAt).toBe('2031-06-03T06:00:00.000Z');
    await mockTaskUpdate(t.id, { dueAt: null }, moved.version);
    expect(await mockReminderList(t.id)).toHaveLength(0);
  });

  it('Task chuyển Done: reminder Pending → Dismissed; TaskDetail có reminders', async () => {
    const t = await mockTaskCreate({ title: 'Xong sớm', dueDate: '2031-06-04' });
    await mockReminderSet({ taskId: t.id, offsetMinutes: 0 });
    expect((await mockTaskGet(t.id)).reminders).toHaveLength(1);
    await mockTaskSetStatus(t.id, 'Done');
    expect((await mockReminderList(t.id))[0]?.status).toBe('Dismissed');
  });

  it('reminder bị lỡ: liệt kê, bỏ qua từng mục và tất cả', async () => {
    const missed = await mockReminderMissedList(); // dữ liệu mẫu có 1 mục
    expect(missed.length).toBeGreaterThanOrEqual(1);
    const first = missed[0];
    await mockReminderDismiss(first?.reminder.id ?? '');
    expect((await mockReminderMissedList()).length).toBe(missed.length - 1);
    await mockReminderDismissAll();
    expect(await mockReminderMissedList()).toHaveLength(0);
  });
});
