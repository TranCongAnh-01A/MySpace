import { TZDate } from '@date-fns/tz';

const p2 = (n: number) => String(n).padStart(2, '0');

/** Chuỗi `YYYY-MM-DD` của một đối tượng ngày theo getter local (đã gắn TZDate hoặc Date thường). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Ngày hôm nay (`YYYY-MM-DD`) theo múi giờ IANA. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return ymd(new TZDate(now.getTime(), timeZone));
}

/** Ngày + giờ địa phương (theo `timeZone`) của một thời điểm UTC ISO. */
export function utcToLocalParts(iso: string, timeZone: string): { date: string; time: string } {
  const d = new TZDate(new Date(iso).getTime(), timeZone);
  return { date: ymd(d), time: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
}

/** Giờ địa phương (`date` = `YYYY-MM-DD`, `time` = `HH:mm`) ở `timeZone` → UTC ISO (`...sssZ`). */
export function localToUtc(date: string, time: string, timeZone: string): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone).getTime()).toISOString();
}

/** Cộng ngày vào chuỗi `YYYY-MM-DD` (không phụ thuộc múi giờ). */
export function addDays(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}

/** Thứ trong tuần của `YYYY-MM-DD`: 0 = Chủ nhật. */
export function weekdayOf(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
