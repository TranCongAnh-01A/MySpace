/** Bỏ dấu tiếng Việt, đổi `đ` → `d`, chữ thường (dùng cho lọc/tìm không dấu). */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
