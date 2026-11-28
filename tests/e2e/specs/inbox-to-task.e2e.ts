import { $, expect } from '@wdio/globals';
import { dialogButton, navLink, row, tab, waitForApp } from '../helpers/ui';

// Luồng 1 (spec 12.1): Inbox → Task. Quick Capture bằng phím tắt toàn cục không bấm được qua
// WebDriver (đã thử tay ở v0.1 và v0.4), nên thêm bằng nút "+ Thêm nhanh" trên titlebar.
describe('Inbox → Task', () => {
  const TEXT = 'Mua sữa cho mèo';

  it('thêm Inbox, chuyển thành Task có hạn, Task hiện ở Tasks và Inbox sang "Đã xử lý"', async () => {
    await waitForApp();

    // 1. Thêm nhanh từ titlebar.
    await $('[data-testid="titlebar-quick-add"]').click();
    const input = $('#quick-add-text');
    await input.waitForDisplayed();
    await input.waitForClickable(); // hộp thoại còn đang hiện dần thì setValue báo "not interactable"
    await input.setValue(TEXT);
    await dialogButton('Thêm').click();
    await input.waitForExist({ reverse: true });

    // 2. Mở Inbox, chuyển thành Task và đặt hạn hôm nay.
    await navLink('Inbox').click();
    const item = row(TEXT);
    await item.waitForDisplayed();
    await item.$('.//button[normalize-space(.)="Chuyển thành Task"]').click();

    await $('#create-title').waitForDisplayed();
    expect(await $('#create-title').getValue()).toBe(TEXT);
    await $('[data-testid="create-task-due"]').click();
    await $('[data-testid="date-picker-content"] [data-today="true"] button').click();
    await dialogButton('Tạo').click();
    await $('#create-title').waitForExist({ reverse: true });

    // 3. Task hiện ở Tasks, kèm hạn "Hôm nay".
    await navLink('Tasks').click();
    const task = row(TEXT);
    await task.waitForDisplayed();
    await expect(task).toHaveText(expect.stringContaining('Hôm nay'));

    // 4. Mục Inbox không còn ở "Đang mở" mà chuyển sang "Đã xử lý".
    await navLink('Inbox').click();
    await tab('Đã xử lý').click();
    await row(TEXT).waitForDisplayed();
    await tab('Đang mở').click();
    await row(TEXT).waitForExist({ reverse: true });
  });
});
