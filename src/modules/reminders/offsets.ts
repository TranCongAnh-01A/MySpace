import type { TFunction } from '@/lib/i18n';
import type { Reminder } from '@/lib/ipc/contract';
import { localToUtc, utcToLocalParts } from '@/lib/tz';

/** Các mức nhắc trước có sẵn (phút): đúng giờ, 5, 10, 15, 30 phút, 1 giờ, 1 ngày. */
export const OFFSETS = [0, 5, 10, 15, 30, 60, 1440] as const;

/** Danh sách mức nhắc: các mức có sẵn, thêm mức mặc định của Settings nếu chưa có. */
export function offsetChoices(defaultMinutes: number): number[] {
  const set = new Set<number>(OFFSETS);
  if (Number.isFinite(defaultMinutes) && defaultMinutes >= 0) set.add(defaultMinutes);
  return [...set].sort((a, b) => a - b);
}

export function offsetLabel(minutes: number, t: TFunction): string {
  if (minutes === 0) return t('rem.atTime');
  if (minutes === 1440) return t('rem.dayBefore');
  if (minutes === 60) return t('rem.hourBefore');
  if (minutes % 1440 === 0) return t('rem.daysBefore', { n: minutes / 1440 });
  if (minutes % 60 === 0) return t('rem.hoursBefore', { n: minutes / 60 });
  return t('rem.minBefore', { n: minutes });
}

/** Nguồn không có thời điểm gốc (Task chưa đặt hạn) thì không dùng được mức nhắc trước. */
export const canUseOffset = (hasOrigin: boolean) => hasOrigin;

/** Ngày địa phương của bản ghi mà nhắc nhở này trỏ tới (để mở Calendar đúng ngày). */
export function reminderTargetDay(r: Reminder, timeZone: string): string {
  const base =
    r.offsetMinutes !== undefined
      ? new Date(new Date(r.triggerAt).getTime() + r.offsetMinutes * 60000).toISOString()
      : r.triggerAt;
  return utcToLocalParts(base, timeZone).date;
}

/** Giờ cụ thể (ngày + giờ địa phương) → `triggerAt` UTC. */
export const fixedTrigger = (date: string, time: string, timeZone: string) =>
  localToUtc(date, time, timeZone);

/** Route tới bản ghi: Task → `/tasks/<id>`; Event → `/calendar?date=…&event=<id>`. */
export function routeFor(
  target: { taskId?: string; eventId?: string },
  day: string | undefined,
): string {
  if (target.taskId) return `/tasks/${target.taskId}`;
  const q = new URLSearchParams();
  if (day) q.set('date', day);
  if (target.eventId) q.set('event', target.eventId);
  return `/calendar?${q.toString()}`;
}
