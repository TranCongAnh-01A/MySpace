import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Providers } from '@/app/providers';
import * as commands from '@/lib/ipc/commands';
import type { AppSettings } from '@/lib/ipc/contract';
import { SettingsPage } from './SettingsPage';

vi.mock('@/lib/ipc/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ipc/commands')>()),
  settingsGet: vi.fn(),
  settingsUpdate: vi.fn(),
  shortcutRegister: vi.fn(),
  areaList: vi.fn(),
  backupList: vi.fn(),
  appInfo: vi.fn(),
}));

const settings: AppSettings = {
  theme: 'Dark',
  language: 'vi',
  timezone: 'Asia/Ho_Chi_Minh',
  dateFormat: 'DD/MM/YYYY',
  weekStart: 'Mon',
  quickCaptureShortcut: 'Ctrl+Shift+Space',
  launchAtStartup: false,
  startHidden: false,
  closeToTray: true,
  notificationsEnabled: true,
  defaultReminderMinutes: 15,
  trashRetentionDays: 30,
};

function renderAt(path: string) {
  render(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings/:tab?" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </Providers>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(commands.settingsGet).mockResolvedValue(settings);
    vi.mocked(commands.areaList).mockResolvedValue([]);
    vi.mocked(commands.backupList).mockResolvedValue([]);
  });

  it('có đủ 5 tab', async () => {
    renderAt('/settings');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Chung',
      'Phím tắt & hệ thống',
      'Thông báo',
      'Lĩnh vực',
      'Dữ liệu',
    ]);
  });

  it('error state có nút Thử lại gọi lại settings_get', async () => {
    vi.mocked(commands.settingsGet).mockRejectedValueOnce({
      code: 'INTERNAL',
      message: 'không có command',
    });
    renderAt('/settings/general');
    expect(await screen.findByRole('alert')).toHaveTextContent('không có command');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Giao diện')).toBeInTheDocument();
  });

  it('khởi động ẩn bị khoá khi chưa bật khởi động cùng Windows', async () => {
    renderAt('/settings/system');
    const hidden = await screen.findByRole('switch', { name: /Khởi động ẩn/ });
    expect(hidden).toBeDisabled();
  });

  it('CONFLICT khi đổi phím tắt: báo lỗi dưới ô, giữ phím cũ', async () => {
    vi.mocked(commands.shortcutRegister).mockRejectedValue({
      code: 'CONFLICT',
      message: 'Tổ hợp phím này đã bị ứng dụng khác chiếm',
    });
    renderAt('/settings/system');
    await userEvent.click(await screen.findByRole('button', { name: /^Đổi phím/ }));
    await userEvent.keyboard('{Alt>}k{/Alt}');
    expect(await screen.findByText(/đã bị ứng dụng khác chiếm/)).toBeInTheDocument();
    expect(commands.shortcutRegister).toHaveBeenCalledWith('Alt+K');
    expect(screen.getByText('Ctrl+Shift+Space')).toBeInTheDocument();
  });

  it('đổi cài đặt: cập nhật lạc quan và rollback khi lỗi', async () => {
    vi.mocked(commands.settingsUpdate).mockRejectedValue({ code: 'VALIDATION', message: 'Sai' });
    renderAt('/settings/notifications');
    const sw = await screen.findByRole('switch', { name: 'Bật thông báo' });
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    expect(commands.settingsUpdate).toHaveBeenCalledWith({ notificationsEnabled: false });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Bật thông báo' })).toBeChecked(),
    );
  });

  it('Lĩnh vực trống hiện empty state có gợi ý', async () => {
    renderAt('/settings/areas');
    const empty = await screen.findByText('Chưa có lĩnh vực nào');
    expect(
      within(empty.parentElement as HTMLElement).getByText(/nhóm Task và Project/),
    ).toBeInTheDocument();
  });
});
