import type { CalendarItem, Event, Task } from '@/lib/ipc/contract';
import {
  applyEventPatch,
  blockRangeFromDrop,
  deadlinePatchFromFc,
  eventParts,
  eventPatchFromFc,
  partsError,
  partsToCreate,
  partsToPatch,
  rangeFromFc,
  shiftParts,
  toFcEvent,
  toggleAllDay,
  unscheduledTasks,
} from './mapping';

const TZ = 'Asia/Ho_Chi_Minh';

const timed: Event = {
  id: 'e1',
  calendarId: 'default',
  title: 'Họp',
  description: '',
  isAllDay: false,
  startAt: '2026-11-26T02:00:00.000Z', // 09:00 giờ VN
  endAt: '2026-11-26T03:30:00.000Z',
  version: 1,
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
};
const allDay: Event = {
  ...timed,
  id: 'e2',
  isAllDay: true,
  startDate: '2026-11-27',
  endDate: '2026-11-28', // inclusive
};
delete allDay.startAt;
delete allDay.endAt;

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Viết báo cáo',
  description: '',
  status: 'Todo',
  priority: 'Medium',
  sortKey: '1',
  tagIds: [],
  checklistDone: 0,
  checklistTotal: 0,
  version: 1,
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
  ...over,
});

describe('khoảng ngày gửi cho calendar_range', () => {
  it('`to` là end − 1 ngày (end của FullCalendar là exclusive)', () => {
    expect(rangeFromFc('2026-11-23T00:00:00+07:00', '2026-11-30T00:00:00+07:00')).toEqual({
      from: '2026-11-23',
      to: '2026-11-29',
    });
    // chế độ ngày: end = ngày kế tiếp
    expect(rangeFromFc('2026-11-26', '2026-11-27')).toEqual({
      from: '2026-11-26',
      to: '2026-11-26',
    });
    // qua tháng / năm
    expect(rangeFromFc('2026-12-28', '2027-01-04').to).toBe('2027-01-03');
  });
});

describe('Event → FullCalendar', () => {
  it('Event cả ngày: endDate inclusive → end exclusive (+1 ngày)', () => {
    const fc = toFcEvent({ kind: 'Event', event: allDay });
    expect(fc).toMatchObject({ allDay: true, start: '2026-11-27', end: '2026-11-29' });
  });

  it('Event có giờ giữ nguyên giờ UTC; time block có lớp lh-block', () => {
    const fc = toFcEvent({ kind: 'Event', event: { ...timed, taskId: 't1' } });
    expect(fc).toMatchObject({ allDay: false, start: timed.startAt, end: timed.endAt });
    expect(fc.classNames).toContain('lh-block');
  });

  it('deadline: dueDate ở hàng cả ngày, dueAt thành khối 30 phút, không dãn được, Done gạch ngang', () => {
    const byDate = toFcEvent({ kind: 'Deadline', task: task({ dueDate: '2026-11-26' }) });
    expect(byDate).toMatchObject({ allDay: true, start: '2026-11-26', durationEditable: false });
    expect(byDate.classNames).toContain('lh-deadline');
    const byTime = toFcEvent({
      kind: 'Deadline',
      task: task({ dueAt: '2026-11-26T07:00:00.000Z', status: 'Done' }),
    });
    expect(byTime).toMatchObject({
      allDay: false,
      start: '2026-11-26T07:00:00.000Z',
      end: '2026-11-26T07:30:00.000Z',
    });
    expect(byTime.classNames).toContain('lh-done');
  });
});

describe('kéo/dãn Event → patch', () => {
  it('Event có giờ: đổi giờ giữ độ dài', () => {
    const patch = eventPatchFromFc(timed, {
      allDay: false,
      startStr: '2026-11-27T14:00:00+07:00',
      endStr: '',
    });
    expect(patch).toEqual({
      startAt: '2026-11-27T07:00:00.000Z',
      endAt: '2026-11-27T08:30:00.000Z', // 90 phút như cũ
    });
  });

  it('Event có giờ: dãn mép dùng endStr', () => {
    const patch = eventPatchFromFc(timed, {
      allDay: false,
      startStr: '2026-11-26T09:00:00+07:00',
      endStr: '2026-11-26T12:00:00+07:00',
    });
    expect(patch).toEqual({
      startAt: '2026-11-26T02:00:00.000Z',
      endAt: '2026-11-26T05:00:00.000Z',
    });
  });

  it('Event cả ngày: end exclusive của FullCalendar → endDate inclusive', () => {
    const patch = eventPatchFromFc(allDay, {
      allDay: true,
      startStr: '2026-11-30',
      endStr: '2026-12-02',
    });
    expect(patch).toEqual({ startDate: '2026-11-30', endDate: '2026-12-01' });
  });

  it('Event cả ngày không có end → một ngày', () => {
    expect(eventPatchFromFc(allDay, { allDay: true, startStr: '2026-11-30', endStr: '' })).toEqual({
      startDate: '2026-11-30',
      endDate: '2026-11-30',
    });
  });

  it('kéo Event có giờ lên hàng cả ngày: gửi đủ bộ trường mới, null cho bộ cũ', () => {
    const patch = eventPatchFromFc(timed, { allDay: true, startStr: '2026-11-27', endStr: '' });
    expect(patch).toEqual({
      isAllDay: true,
      startAt: null,
      endAt: null,
      startDate: '2026-11-27',
      endDate: '2026-11-27',
    });
  });

  it('kéo Event cả ngày xuống khung giờ: mặc định 60 phút', () => {
    const patch = eventPatchFromFc(allDay, {
      allDay: false,
      startStr: '2026-11-27T10:00:00+07:00',
      endStr: '',
    });
    expect(patch).toEqual({
      isAllDay: false,
      startDate: null,
      endDate: null,
      startAt: '2026-11-27T03:00:00.000Z',
      endAt: '2026-11-27T04:00:00.000Z',
    });
  });

  it('applyEventPatch xử lý null = xoá trường', () => {
    const next = applyEventPatch(timed, {
      isAllDay: true,
      startAt: null,
      endAt: null,
      startDate: 'x',
    });
    expect(next.startAt).toBeUndefined();
    expect(next).toMatchObject({ isAllDay: true, startDate: 'x' });
  });
});

describe('kéo deadline → patch của Task', () => {
  it('thả vào hàng cả ngày → dueDate, xoá dueAt', () => {
    expect(deadlinePatchFromFc({ allDay: true, startStr: '2026-11-28' })).toEqual({
      dueDate: '2026-11-28',
      dueAt: null,
    });
  });
  it('thả vào khung giờ → dueAt (UTC), xoá dueDate', () => {
    expect(deadlinePatchFromFc({ allDay: false, startStr: '2026-11-28T15:30:00+07:00' })).toEqual({
      dueAt: '2026-11-28T08:30:00.000Z',
      dueDate: null,
    });
  });
});

describe('thả Task vào lịch (time block)', () => {
  it('khung giờ: giờ thả + estimatedMinutes', () => {
    expect(
      blockRangeFromDrop({ allDay: false, dateStr: '2026-11-26T09:00:00+07:00' }, 120, TZ),
    ).toEqual({ startAt: '2026-11-26T02:00:00.000Z', endAt: '2026-11-26T04:00:00.000Z' });
  });
  it('không có ước lượng thì 60 phút; hàng cả ngày thì 09:00 giờ địa phương', () => {
    expect(blockRangeFromDrop({ allDay: true, dateStr: '2026-11-27' }, undefined, TZ)).toEqual({
      startAt: '2026-11-27T02:00:00.000Z',
      endAt: '2026-11-27T03:00:00.000Z',
    });
  });
});

describe('danh sách "Chưa xếp lịch"', () => {
  const range = { from: '2026-11-23', to: '2026-11-29' };
  const dayOf = (t: Task) => t.dueDate;
  const block: CalendarItem = { kind: 'Event', event: { ...timed, taskId: 'has-block' } };
  it('bỏ Task Done, Task đã có block, Task có hạn ngoài khoảng; giữ Task không hạn', () => {
    const list = unscheduledTasks(
      [
        task({ id: 'ok-in', dueDate: '2026-11-25' }),
        task({ id: 'ok-none' }),
        task({ id: 'done', status: 'Done' }),
        task({ id: 'has-block' }),
        task({ id: 'out', dueDate: '2026-12-10' }),
      ],
      [block],
      range,
      dayOf,
    );
    expect(list.map((t) => t.id)).toEqual(['ok-in', 'ok-none']);
  });
});

describe('form thời gian của Event', () => {
  it('eventParts → partsToPatch khứ hồi theo múi giờ Settings', () => {
    const parts = eventParts(timed, TZ);
    expect(parts).toMatchObject({ startDate: '2026-11-26', startTime: '09:00', endTime: '10:30' });
    expect(partsToPatch(parts, TZ)).toMatchObject({
      isAllDay: false,
      startAt: timed.startAt,
      endAt: timed.endAt,
      startDate: null,
      endDate: null,
    });
  });

  it('đổi ngày bắt đầu dời cả điểm kết thúc, giữ độ dài', () => {
    const next = shiftParts(eventParts(timed, TZ), { startDate: '2026-11-30' }, TZ);
    expect(next).toMatchObject({
      startDate: '2026-11-30',
      endDate: '2026-11-30',
      endTime: '10:30',
    });
  });

  it('bật "cả ngày" rồi tắt: về 09:00–10:00', () => {
    const on = toggleAllDay(eventParts(timed, TZ), true, TZ);
    expect(partsToPatch(on, TZ)).toMatchObject({ isAllDay: true, startAt: null, endAt: null });
    const off = toggleAllDay(on, false, TZ);
    expect(off).toMatchObject({ isAllDay: false, startTime: '09:00', endTime: '10:00' });
  });

  it('kết thúc không sau bắt đầu → lỗi; partsToCreate đúng bộ trường', () => {
    const p = eventParts(timed, TZ);
    expect(partsError({ ...p, endTime: '09:00' }, TZ)).toBe('end');
    expect(partsError(p, TZ)).toBeUndefined();
    expect(partsToCreate(p, { title: 'A' }, TZ)).toEqual({
      title: 'A',
      isAllDay: false,
      startAt: timed.startAt,
      endAt: timed.endAt,
    });
  });
});
