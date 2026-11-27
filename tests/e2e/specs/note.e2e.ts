import { $, browser, expect } from '@wdio/globals';
import { ctrl, navLink, row, waitForApp } from '../helpers/ui';

// Luồng 4 (spec 12.1): Note. Gõ nội dung, đợi "Đã lưu", gõ thêm một câu rồi thoát ngay bằng
// Ctrl+Q (đi qua `app-will-quit` để lưu nốt), mở lại app: cả hai đoạn đều còn.
const TITLE = 'Ghi chú E2E';
const FIRST = 'Đoạn đầu đã được lưu tự động.';
const SECOND = 'Đoạn hai gõ xong là thoát ngay.';

const editor = () => $('[aria-label="Nội dung ghi chú"]');

describe('Note', () => {
  it('lưu nốt khi thoát bằng Ctrl+Q và còn nguyên sau khi mở lại', async () => {
    await waitForApp();
    await navLink('Notes').click();

    // 1. Tạo Note, đặt tiêu đề, gõ đoạn đầu và đợi "Đã lưu".
    await $('[aria-label="Tạo ghi chú mới"]').click();
    const title = $('[aria-label="Tiêu đề ghi chú"]');
    await title.waitForDisplayed();
    await title.setValue(TITLE);
    await editor().click();
    await browser.keys(FIRST);
    await $('[role="status"]*=Đã lưu lúc').waitForDisplayed({ timeout: 15_000 });

    // 2. Gõ thêm một câu rồi thoát ngay (không chờ autosave).
    await browser.keys([' ']);
    await browser.keys(SECOND);
    await ctrl('q');
    await browser.pause(2500); // app-will-quit chờ frontend lưu tối đa 1,5 giây rồi thoát

    // 3. Mở lại app với cùng thư mục dữ liệu.
    await reopen();
    await waitForApp();
    await navLink('Notes').click();
    const item = row(TITLE);
    await item.waitForDisplayed();
    await item.click();
    await editor().waitForDisplayed();
    await browser.waitUntil(async () => (await editor().getText()).includes(SECOND), {
      timeoutMsg: 'Đoạn gõ ngay trước khi thoát không được lưu',
    });
    const text = await editor().getText();
    expect(text).toContain(FIRST);
    expect(text).toContain(SECOND);
  });
});

/** App đã thoát nên phiên cũ không còn; tạo phiên mới = chạy lại app. */
async function reopen(): Promise<void> {
  try {
    await browser.reloadSession();
  } catch {
    await browser.reloadSession();
  }
}
