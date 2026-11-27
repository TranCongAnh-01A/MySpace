import { $, browser, expect } from '@wdio/globals';
import { dialogButton, navLink, setInputValue, waitForApp } from '../helpers/ui';

// Luồng 3 (spec 12.1): Calendar. Tạo Event qua dialog, thấy ở chế độ Danh sách,
// mở Event, sửa giờ bắt đầu trong panel (tự lưu), giờ mới hiện đúng.
const TITLE = 'Họp kế hoạch quý';
const NEW_START = '16:45';

describe('Calendar', () => {
  it('tạo Event, sửa giờ trong panel và thấy giờ mới', async () => {
    await waitForApp();
    await navLink('Calendar').click();

    // 1. Tạo Event bằng nút "Tạo sự kiện" và dialog.
    await $('[data-testid="calendar-create"]').click();
    const title = $('#ev-title');
    await title.waitForDisplayed();
    await title.setValue(TITLE);
    await dialogButton('Tạo sự kiện').click();
    await title.waitForExist({ reverse: true });

    // 2. Chế độ Danh sách: Event có mặt.
    await $('//button[normalize-space(.)="Danh sách"]').click();
    const item = $(`//tr[contains(@class,"fc-list-event")][contains(., "${TITLE}")]`);
    await item.waitForDisplayed({ timeout: 15_000 });

    // 3. Mở Event, đổi giờ bắt đầu trong panel.
    await item.click();
    const panel = $('//*[@aria-label="Sự kiện"]');
    await panel.waitForDisplayed();
    const start = $('//input[@type="time"][@aria-label="Bắt đầu — Giờ"]');
    await start.waitForDisplayed();
    await setInputValue(start, NEW_START);

    // 4. Giờ mới hiện đúng: ở chính panel (sau khi lưu) và ở danh sách.
    await browser.waitUntil(async () => (await start.getValue()) === NEW_START, {
      timeoutMsg: 'Ô giờ bắt đầu không giữ giá trị mới',
    });
    await browser.waitUntil(async () => (await item.getText()).includes(NEW_START), {
      timeout: 15_000,
      timeoutMsg: `Danh sách không hiện giờ mới ${NEW_START}`,
    });
    await expect(item).toHaveText(expect.stringContaining(TITLE));
  });
});
