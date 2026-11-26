import type { DateFormat } from '@/lib/ipc/contract';

function parts(date: Date, timeZone?: string) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(date)) out[p.type] = p.value;
  return {
    y: out.year ?? '',
    m: out.month ?? '',
    d: out.day ?? '',
    hh: out.hour ?? '',
    mm: out.minute ?? '',
  };
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** Định dạng ngày theo `dateFormat` trong settings, tại múi giờ `timeZone` (IANA). */
export function formatDate(value: Date | string, format: DateFormat, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const { y, m, d } = parts(date, timeZone);
  switch (format) {
    case 'DD/MM/YYYY':
      return `${d}/${m}/${y}`;
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'YYYY-MM-DD':
      return `${y}-${m}-${d}`;
  }
}

export function formatDateTime(
  value: Date | string,
  format: DateFormat,
  timeZone?: string,
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const { hh, mm } = parts(date, timeZone);
  return `${formatDate(date, format, timeZone)} ${hh}:${mm}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
