import { $, browser, expect } from '@wdio/globals';
import { waitForApp } from '../helpers/ui';

describe('Khởi động', () => {
  it('app mở được với thư mục dữ liệu riêng của E2E', async () => {
    await waitForApp();
    await expect($('[data-testid="titlebar-quick-add"]')).toBeDisplayed();
    expect(await browser.getTitle()).toContain('LifeHub');
  });
});
