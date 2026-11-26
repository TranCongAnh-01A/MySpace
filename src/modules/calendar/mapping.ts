// Hàm thuần: đổi giữa dữ liệu core (CalendarItem, Event, Task) và kết quả của FullCalendar.
// Không dùng `Date` của FullCalendar (lệch múi giờ khi `timeZone` là tên IANA): chỉ dùng chuỗi `startStr`/`endStr`.
import type {
  CalendarItem,
  Event,
  EventCreate,
  EventPatch,
  Task,
  TaskPatch,
} from '@/lib/ipc/contract';
import { addDays, localToUtc, utcToLocalParts } from '@/lib/tz';

export const DEFAULT_BLOCK_MINUTES = 60;
export const DEADLINE_MINUTES = 30;

export type CalendarView = 'day' | 'week' | 'month' | 'list';
export const VIEWS: CalendarView[] = ['day', 'week', 'month', 'list'];

export const FC_VIEW: Record<CalendarView, string> = {
  day: 'timeGridDay',
  week: 'timeGridWeek',
  month: 'dayGridMonth',
  list: 'listWeek',
};

export function viewFromFc(type: string): CalendarView {
  return (VIEWS.find((v) => FC_VIEW[v] === type) ?? 'week') as CalendarView;
}

/** Khoảng ngày gửi cho `calendar_range`: `end` của FullCalendar là exclusive nên `to` = end − 1 ngày. */
export function rangeFromFc(startStr: string, endStr: string): { from: string; to: string } {
  return { from: startStr.slice(0, 10), to: addDays(endStr.slice(0, 10), -1) };
}

const addMinutes = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60000).toISOString();

export type FcEventInput = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  editable?: boolean;
  durationEditable?: boolean;
  classNames: string[];
  backgroundColor?: string;
  borderColor?: string;
  extendedProps: { kind: 'Event' | 'Deadline'; item: CalendarItem };
};

export function toFcEvent(
  item: CalendarItem,
  colorOf?: (calendarId: string) => string | undefined,
) {
  if (item.kind === 'Deadline') {
    const t = item.task;
    const done = t.status === 'Done';
    const base = {
      id: `dl:${t.id}`,
      title: t.title,
      classNames: ['lh-deadline', ...(done ? ['lh-done'] : [])],
      durationEditable: false,
      extendedProps: { kind: 'Deadline' as const, item },
    };
    if (t.dueAt)
      return {
        ...base,
        start: t.dueAt,
        end: addMinutes(t.dueAt, DEADLINE_MINUTES),
        allDay: false,
      } satisfies FcEventInput;
    return { ...base, start: t.dueDate ?? '', allDay: true } satisfies FcEventInput;
  }
  const e = item.event;
  const color = colorOf?.(e.calendarId);
  const base = {
    id: `ev:${e.id}`,
    title: e.title,
    classNames: ['lh-event', ...(e.taskId ? ['lh-block'] : [])],
    ...(color ? { backgroundColor: color, borderColor: color } : {}),
    extendedProps: { kind: 'Event' as const, item },
  };
  if (e.isAllDay)
    return {
      ...base,
      start: e.startDate ?? '',
      end: addDays(e.endDate ?? e.startDate ?? '', 1), // core: endDate inclusive → FullCalendar: exclusive
      allDay: true,
    } satisfies FcEventInput;
  return {
    ...base,
    start: e.startAt ?? '',
    end: e.endAt ?? '',
    allDay: false,
  } satisfies FcEventInput;
}

export type FcResult = { allDay: boolean; startStr: string; endStr: string };

/** Kéo/dãn Event → patch. `endStr` rỗng khi FullCalendar không có `end`. */
export function eventPatchFromFc(prev: Event, r: FcResult): EventPatch {
  const changedKind = prev.isAllDay !== r.allDay;
  if (r.allDay) {
    const startDate = r.startStr.slice(0, 10);
    const endDate = r.endStr ? addDays(r.endStr.slice(0, 10), -1) : startDate; // exclusive → inclusive
    return {
      ...(changedKind ? { isAllDay: true, startAt: null, endAt: null } : {}),
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
    };
  }
  const startAt = new Date(r.startStr).toISOString();
  let minutes = DEFAULT_BLOCK_MINUTES;
  if (!changedKind && prev.startAt && prev.endAt)
    minutes = Math.round(
      (new Date(prev.endAt).getTime() - new Date(prev.startAt).getTime()) / 60000,
    );
  const endAt = r.endStr ? new Date(r.endStr).toISOString() : addMinutes(startAt, minutes);
  return {
    ...(changedKind ? { isAllDay: false, startDate: null, endDate: null } : {}),
    startAt,
    endAt,
  };
}

/** Kéo deadline: hàng cả ngày → `dueDate`; khung giờ → `dueAt` (luôn xoá trường kia). */
export function deadlinePatchFromFc(r: Pick<FcResult, 'allDay' | 'startStr'>): TaskPatch {
  if (r.allDay) return { dueDate: r.startStr.slice(0, 10), dueAt: null };
  return { dueAt: new Date(r.startStr).toISOString(), dueDate: null };
}

/** Thả Task từ danh sách "Chưa xếp lịch": hàng cả ngày thì mặc định 09:00 giờ địa phương. */
export function blockRangeFromDrop(
  drop: { allDay: boolean; dateStr: string },
  minutes: number | undefined,
  timeZone: string,
): { startAt: string; endAt: string } {
  const startAt = drop.allDay
    ? localToUtc(drop.dateStr.slice(0, 10), '09:00', timeZone)
    : new Date(drop.dateStr).toISOString();
  return { startAt, endAt: addMinutes(startAt, minutes ?? DEFAULT_BLOCK_MINUTES) };
}

/** Task chưa Done, chưa có time block trong khoảng đang xem; có hạn thì hạn phải nằm trong khoảng. */
export function unscheduledTasks(
  tasks: Task[],
  items: CalendarItem[],
  range: { from: string; to: string },
  dayOfDue: (t: Task) => string | undefined,
): Task[] {
  const blocked = new Set<string>();
  items.forEach((i) => {
    if (i.kind === 'Event' && i.event.taskId) blocked.add(i.event.taskId);
  });
  return tasks.filter((t) => {
    if (t.status === 'Done' || blocked.has(t.id)) return false;
    const d = dayOfDue(t);
    return !d || (d >= range.from && d <= range.to);
  });
}

// ---- áp patch vào cache (optimistic update khi kéo thả) ----
export function applyEventPatch(e: Event, p: EventPatch): Event {
  const next: Event = { ...e };
  if (p.title !== undefined) next.title = p.title;
  if (p.description !== undefined) next.description = p.description;
  if (p.calendarId !== undefined) next.calendarId = p.calendarId;
  if (p.isAllDay !== undefined) next.isAllDay = p.isAllDay;
  (['startAt', 'endAt', 'startDate', 'endDate'] as const).forEach((k) => {
    const v = p[k];
    if (v === undefined) return;
    if (v === null) delete next[k];
    else next[k] = v;
  });
  return next;
}

export function applyDuePatch(t: Task, p: TaskPatch): Task {
  const next: Task = { ...t };
  (['dueDate', 'dueAt'] as const).forEach((k) => {
    const v = p[k];
    if (v === undefined) return;
    if (v === null) delete next[k];
    else next[k] = v;
  });
  return next;
}

// ---- form thời gian của Event (dialog tạo + panel sửa) ----
export type EventParts = {
  isAllDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export function eventParts(e: Event, timeZone: string): EventParts {
  if (e.isAllDay) {
    const d = e.startDate ?? '';
    return {
      isAllDay: true,
      startDate: d,
      startTime: '09:00',
      endDate: e.endDate ?? d,
      endTime: '10:00',
    };
  }
  const s = utcToLocalParts(e.startAt ?? new Date().toISOString(), timeZone);
  const en = utcToLocalParts(e.endAt ?? e.startAt ?? new Date().toISOString(), timeZone);
  return {
    isAllDay: false,
    startDate: s.date,
    startTime: s.time,
    endDate: en.date,
    endTime: en.time,
  };
}

/** Bộ trường thời gian đầy đủ (null cho bộ cũ) — dùng khi sửa trong panel. */
export function partsToPatch(p: EventParts, timeZone: string): EventPatch {
  if (p.isAllDay)
    return {
      isAllDay: true,
      startDate: p.startDate,
      endDate: p.endDate,
      startAt: null,
      endAt: null,
    };
  return {
    isAllDay: false,
    startAt: localToUtc(p.startDate, p.startTime, timeZone),
    endAt: localToUtc(p.endDate, p.endTime, timeZone),
    startDate: null,
    endDate: null,
  };
}

export function partsToCreate(
  p: EventParts,
  base: { title: string; description?: string },
  timeZone: string,
): EventCreate {
  const description = base.description ? { description: base.description } : {};
  if (p.isAllDay)
    return {
      title: base.title,
      ...description,
      isAllDay: true,
      startDate: p.startDate,
      endDate: p.endDate,
    };
  return {
    title: base.title,
    ...description,
    isAllDay: false,
    startAt: localToUtc(p.startDate, p.startTime, timeZone),
    endAt: localToUtc(p.endDate, p.endTime, timeZone),
  };
}

/** Lỗi nhập liệu phía giao diện (core vẫn kiểm tra lại). */
export function partsError(p: EventParts, timeZone: string): 'end' | undefined {
  if (!p.startDate || !p.endDate) return 'end';
  if (p.isAllDay) return p.endDate < p.startDate ? 'end' : undefined;
  return localToUtc(p.endDate, p.endTime, timeZone) <=
    localToUtc(p.startDate, p.startTime, timeZone)
    ? 'end'
    : undefined;
}

/** Đổi ngày/giờ bắt đầu thì dời cả điểm kết thúc (giữ độ dài). */
export function shiftParts(
  p: EventParts,
  next: { startDate?: string; startTime?: string },
  timeZone: string,
): EventParts {
  const startDate = next.startDate ?? p.startDate;
  const startTime = next.startTime ?? p.startTime;
  if (p.isAllDay) {
    const days = Math.round(
      (new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 86_400_000,
    );
    return { ...p, startDate, endDate: addDays(startDate, Math.max(0, days)) };
  }
  const oldStart = new Date(localToUtc(p.startDate, p.startTime, timeZone)).getTime();
  const oldEnd = new Date(localToUtc(p.endDate, p.endTime, timeZone)).getTime();
  const newStart = new Date(localToUtc(startDate, startTime, timeZone)).getTime();
  const end = utcToLocalParts(new Date(newStart + (oldEnd - oldStart)).toISOString(), timeZone);
  return { ...p, startDate, startTime, endDate: end.date, endTime: end.time };
}

/** Bật/tắt "cả ngày": giữ ngày bắt đầu; sang có giờ thì 09:00 → +60 phút. */
export function toggleAllDay(p: EventParts, isAllDay: boolean, timeZone: string): EventParts {
  if (isAllDay === p.isAllDay) return p;
  if (isAllDay)
    return { ...p, isAllDay, endDate: p.endDate < p.startDate ? p.startDate : p.endDate };
  const start = localToUtc(p.startDate, '09:00', timeZone);
  const end = utcToLocalParts(
    new Date(new Date(start).getTime() + DEFAULT_BLOCK_MINUTES * 60000).toISOString(),
    timeZone,
  );
  return { ...p, isAllDay, startTime: '09:00', endDate: end.date, endTime: end.time };
}
