import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardToday } from '@/lib/ipc/commands';
import type { DateFormat, Language } from '@/lib/ipc/contract';
import { addDays, localToUtc, todayIn } from '@/lib/tz';

export const todayKey = ['today'] as const;

export function useToday() {
  return useQuery({ queryKey: todayKey, queryFn: dashboardToday });
}

/** Số mili giây từ `now` tới 00:00 ngày kế tiếp theo múi giờ của Settings. */
export function msUntilMidnight(timezone: string, now: Date = new Date()): number {
  const next = addDays(todayIn(timezone, now), 1);
  return Math.max(1000, new Date(localToUtc(next, '00:00', timezone)).getTime() - now.getTime());
}

/** Qua nửa đêm (theo múi giờ Settings) thì làm mới Today; hẹn lại cho đêm sau. */
export function useMidnightRefresh(timezone: string) {
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: todayKey });
      setTick((n) => n + 1);
    }, msUntilMidnight(timezone));
    return () => window.clearTimeout(id);
  }, [qc, timezone, tick]);
}

const WEEKDAY_NAMES: Record<Language, string[]> = {
  vi: ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** "Thứ Năm 26/11" (bỏ năm, thứ tự ngày/tháng theo `dateFormat`). */
export function todayHeading(date: string, language: Language, dateFormat: DateFormat): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const short =
    dateFormat === 'DD/MM/YYYY'
      ? `${dd}/${mm}`
      : dateFormat === 'MM/DD/YYYY'
        ? `${mm}/${dd}`
        : `${mm}-${dd}`;
  return `${WEEKDAY_NAMES[language][weekday] ?? ''} ${short}`;
}
