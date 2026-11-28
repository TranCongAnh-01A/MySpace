import path from 'node:path';
import type { ChainablePromiseElement } from 'webdriverio';
import { $, $$, browser } from '@wdio/globals';
import { e2eRoot } from './app';

/** Phần tử theo `data-testid`. */
export const tid = (id: string) => $(`[data-testid="${id}"]`);
export const tids = (id: string) => $$(`[data-testid="${id}"]`);

/**
 * Đợi app dựng xong khung chính và chắc chắn đang dùng thư mục dữ liệu E2E
 * (không phải dữ liệu thật). Sai thì ném lỗi, spec dừng ngay.
 */
export async function waitForApp(): Promise<void> {
  await $('[data-testid="titlebar-quick-add"]').waitForExist({ timeout: 30_000 });
  const info = await browser.execute(() =>
    // @ts-expect-error API nội bộ của Tauri, chỉ dùng trong E2E
    window.__TAURI_INTERNALS__.invoke('app_info'),
  );
  const got = path.resolve((info as { dataDir: string }).dataDir).toLowerCase();
  const want = path.resolve(path.join(e2eRoot(), 'data')).toLowerCase();
  // Bản E2E (debug) không được tự kiểm tra cập nhật: không gọi mạng.
  if ((info as { autoUpdateCheck?: boolean }).autoUpdateCheck !== false) {
    throw new Error('Bản E2E đang bật tự kiểm tra cập nhật (autoUpdateCheck phải là false)');
  }
  if (got !== want) {
    throw new Error(
      `App không dùng thư mục E2E (got ${got}, want ${want}); dừng để bảo vệ dữ liệu thật`,
    );
  }
}

/** Phím tắt trong app (Ctrl+<phím>). */
export async function ctrl(key: string): Promise<void> {
  await browser.keys(['Control', key]);
}

const lit = (s: string) =>
  s.includes('"') ? `concat("${s.split('"').join('", \'"\', "')}")` : `"${s}"`;

/** Nút có đúng chữ này (trong hộp thoại đang mở nếu có). */
export const button = (text: string) => $(`//button[normalize-space(.)=${lit(text)}]`);
export const dialogButton = (text: string) =>
  $(`//*[@role="dialog"]//button[normalize-space(.)=${lit(text)}]`);
/** Liên kết ở thanh bên. */
export const navLink = (text: string) => $(`//nav//a[contains(normalize-space(.), ${lit(text)})]`);
/** Dòng danh sách (`li`, hoặc `role="option"` ở danh sách Task ảo hoá) chứa chữ này. */
export const row = (text: string) =>
  $(`//*[(self::li or @role="option") and contains(normalize-space(.), ${lit(text)})]`);
export const tab = (text: string) => $(`//*[@role="tab"][normalize-space(.)=${lit(text)}]`);

/** Đặt giá trị cho `<input>` do React điều khiển (ô `type="time"` khó gõ qua WebDriver vì phụ thuộc locale). */
export async function setInputValue(el: ChainablePromiseElement, value: string): Promise<void> {
  await browser.execute(
    (node: HTMLInputElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(node, v);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    },
    (await el) as unknown as HTMLInputElement,
    value,
  );
}
