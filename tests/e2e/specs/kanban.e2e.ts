import { $, browser, expect } from '@wdio/globals';
import { button, dialogButton, navLink, waitForApp } from '../helpers/ui';

// Luồng 2 (spec 12.1): Kanban. Tạo 3 Task, kéo một thẻ sang "Xong" bằng bàn phím
// (dnd-kit KeyboardSensor), đóng app rồi mở lại với cùng thư mục dữ liệu.
const TITLES = ['Viết báo cáo', 'Gửi hoá đơn', 'Đặt lịch khám'];

const column = (name: string) => $(`section[aria-label="Cột ${name}"]`);

async function titlesIn(name: string): Promise<string[]> {
  const cards = await column(name).$$('li');
  const out: string[] = [];
  for (const c of cards) out.push((await c.$('button:nth-of-type(2)').getText()).trim());
  return out;
}

async function openBoard(): Promise<void> {
  await navLink('Tasks').click();
  await $('//button[@aria-pressed][normalize-space(.)="Bảng"]').click();
  await column('Cần làm').waitForDisplayed();
}

describe('Kanban', () => {
  it('kéo thẻ sang Xong bằng bàn phím, giữ nguyên sau khi mở lại app', async () => {
    await waitForApp();

    // 1. Tạo 3 Task bằng hộp thoại "Task mới".
    await navLink('Tasks').click();
    for (const title of TITLES) {
      await button('Task mới').click();
      const input = $('#create-title');
      await input.waitForDisplayed();
      await input.setValue(title);
      await dialogButton('Tạo').click();
      await input.waitForExist({ reverse: true });
    }

    // 2. Mở Board; cả 3 thẻ ở cột "Cần làm".
    await openBoard();
    await browser.waitUntil(async () => (await titlesIn('Cần làm')).length === 3, {
      timeoutMsg: 'Chưa thấy đủ 3 thẻ ở cột Cần làm',
    });
    const before = await titlesIn('Cần làm');
    expect([...before].sort()).toEqual([...TITLES].sort());

    // 3. Nhấc thẻ thứ hai, đi sang phải 3 cột (Đang làm → Xem lại → Xong), thả.
    const moved = before[1]!;
    const handle = $(`button[aria-label="Kéo để di chuyển: ${moved}"]`);
    await handle.click(); // focus
    await browser.keys(['Space']);
    for (let i = 0; i < 3; i++) {
      await browser.keys(['ArrowRight']);
      await browser.pause(150);
    }
    await browser.keys(['Space']);

    await browser.waitUntil(async () => (await titlesIn('Xong')).includes(moved), {
      timeoutMsg: `Thẻ "${moved}" không sang cột Xong`,
    });
    const todoAfter = await titlesIn('Cần làm');
    expect(todoAfter).toEqual(before.filter((t) => t !== moved));

    // 4. Đóng app, mở lại với cùng thư mục dữ liệu (reloadSession tạo phiên mới = chạy lại app).
    await browser.reloadSession();
    await waitForApp();
    await openBoard();
    await browser.waitUntil(async () => (await titlesIn('Xong')).length === 1, {
      timeoutMsg: 'Sau khi mở lại không thấy thẻ ở cột Xong',
    });
    expect(await titlesIn('Xong')).toEqual([moved]);
    expect(await titlesIn('Cần làm')).toEqual(todoAfter);
  });
});
