/** `Date` (giờ địa phương của trình duyệt, dùng cho DatePicker) ↔ chuỗi `YYYY-MM-DD`. */
export function dateToStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function strToDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const [y = 0, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
