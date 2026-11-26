import { formatDate } from '@/lib/format/date';
import type { TFunction } from '@/lib/i18n';
import type { AppSettings, Language, Task } from '@/lib/ipc/contract';
import { addDays, todayIn, utcToLocalParts, weekdayOf } from '@/lib/tz';

export type DateCtx = Pick<AppSettings, 'dateFormat' | 'timezone'> & { language: Language };

const WEEKDAY_NAMES: Record<Language, string[]> = {
  vi: ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** Ngày hạn địa phương (`YYYY-MM-DD`) của Task, nếu có. */
export function dueDay(task: Task, timezone: string): string | undefined {
  return task.dueDate ?? (task.dueAt ? utcToLocalParts(task.dueAt, timezone).date : undefined);
}

/** Nhãn ngày kiểu "Hôm nay", "Ngày mai", "Thứ Sáu 27/11/2026". */
export function dayLabel(day: string, ctx: DateCtx, t: TFunction, now = new Date()): string {
  const today = todayIn(ctx.timezone, now);
  if (day === today) return t('due.today');
  if (day === addDays(today, 1)) return t('due.tomorrow');
  const name = WEEKDAY_NAMES[ctx.language][weekdayOf(day)] ?? '';
  return `${name} ${formatDate(`${day}T12:00:00.000Z`, ctx.dateFormat, 'UTC')}`;
}

export type DueInfo = { label: string; overdue: boolean };

export function dueInfo(task: Task, ctx: DateCtx, t: TFunction, now = new Date()): DueInfo | null {
  const day = dueDay(task, ctx.timezone);
  if (!day) return null;
  const time = task.dueAt ? utcToLocalParts(task.dueAt, ctx.timezone).time : '';
  const today = todayIn(ctx.timezone, now);
  const overdue =
    task.status !== 'Done' &&
    (task.dueAt ? task.dueAt < now.toISOString() : task.dueDate ? task.dueDate < today : false);
  return { label: `${dayLabel(day, ctx, t, now)}${time ? ` ${time}` : ''}`, overdue };
}
