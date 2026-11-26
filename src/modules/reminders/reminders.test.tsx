import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Providers } from '../../app/providers';
import { useCoreEvents } from '../../app/useCoreEvents';
import { useUiStore } from '../../app/ui-store';
import {
  reminderDismiss,
  reminderDismissAll,
  reminderList,
  reminderMissedList,
  settingsGet,
} from '../../lib/ipc/commands';
import type { MissedReminder, Navigate } from '../../lib/ipc/contract';
import { onNavigate, onReminderFired } from '../../lib/ipc/events';
import { MissedRemindersDialog } from './MissedRemindersDialog';
import { offsetChoices, offsetLabel, reminderTargetDay, routeFor } from './offsets';
import { ReminderEditor } from './ReminderEditor';
import { translate } from '../../lib/i18n';

vi.mock('../../lib/ipc/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/ipc/commands')>()),
  reminderList: vi.fn(),
  reminderSet: vi.fn(),
  reminderDelete: vi.fn(),
  reminderMissedList: vi.fn(),
  reminderDismiss: vi.fn(),
  reminderDismissAll: vi.fn(),
  settingsGet: vi.fn(),
}));
vi.mock('../../lib/ipc/events', () => ({
  onEntityChanged: vi.fn(() => Promise.resolve(() => {})),
  onNavigate: vi.fn(() => Promise.resolve(() => {})),
  onReminderFired: vi.fn(() => Promise.resolve(() => {})),
}));

const missed = (id: string, title: string): MissedReminder => ({
  reminder: { id, taskId: `task-${id}`, triggerAt: '2026-11-25T08:45:00.000Z', status: 'Missed' },
  title,
  dueLabelAt: '2026-11-25T09:00:00.000Z',
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(settingsGet).mockRejectedValue(new Error('chưa có settings'));
  vi.mocked(reminderList).mockResolvedValue([]);
  vi.mocked(reminderMissedList).mockResolvedValue([]);
  vi.mocked(onNavigate).mockResolvedValue(() => {});
  vi.mocked(onReminderFired).mockResolvedValue(() => {});
  useUiStore.setState({ missedDeferred: false });
});

describe('mức nhắc', () => {
  it('có đủ các mức, thêm mức mặc định của Settings nếu chưa có', () => {
    expect(offsetChoices(15)).toEqual([0, 5, 10, 15, 30, 60, 1440]);
    expect(offsetChoices(45)).toEqual([0, 5, 10, 15, 30, 45, 60, 1440]);
  });
  it('nhãn tiếng Việt', () => {
    const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
      translate('vi', k, v);
    expect(offsetLabel(0, t)).toBe('Đúng giờ');
    expect(offsetLabel(15, t)).toBe('15 phút trước');
    expect(offsetLabel(60, t)).toBe('1 giờ trước');
    expect(offsetLabel(1440, t)).toBe('1 ngày trước');
  });
  it('route tới bản ghi và ngày của reminder offset', () => {
    expect(routeFor({ taskId: 'a' }, undefined)).toBe('/tasks/a');
    expect(routeFor({ eventId: 'e' }, '2026-11-27')).toBe('/calendar?date=2026-11-27&event=e');
    // nhắc trước 1 ngày: ngày của bản ghi là ngày sau ngày nhắc
    expect(
      reminderTargetDay(
        { id: 'r', triggerAt: '2026-11-26T02:00:00.000Z', offsetMinutes: 1440, status: 'Sent' },
        'Asia/Ho_Chi_Minh',
      ),
    ).toBe('2026-11-27');
  });
});

describe('ReminderEditor', () => {
  const renderEditor = (hasOrigin: boolean) =>
    render(
      <Providers>
        <ReminderEditor source={{ kind: 'task', id: 't1' }} hasOrigin={hasOrigin} />
      </Providers>,
    );

  it('nguồn không có thời điểm gốc: ghi chú "Đặt hạn…" và chỉ còn "Giờ cụ thể"', async () => {
    renderEditor(false);
    expect(await screen.findByText('Đặt hạn để dùng nhắc trước.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nhắc lúc nào' })).toHaveTextContent('Giờ cụ thể…');
    expect(screen.getByLabelText('Giờ nhắc')).toBeInTheDocument();
  });

  it('có thời điểm gốc: mặc định 15 phút trước, không có ghi chú', async () => {
    renderEditor(true);
    expect(await screen.findByText('Chưa có nhắc nhở')).toBeInTheDocument();
    expect(screen.queryByText('Đặt hạn để dùng nhắc trước.')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nhắc lúc nào' })).toHaveTextContent(
      '15 phút trước',
    );
  });

  it('liệt kê reminder kèm trạng thái', async () => {
    vi.mocked(reminderList).mockResolvedValue([
      {
        id: 'r1',
        taskId: 't1',
        triggerAt: '2026-11-26T02:00:00.000Z',
        offsetMinutes: 30,
        status: 'Missed',
      },
    ]);
    renderEditor(true);
    expect(await screen.findByText('30 phút trước')).toBeInTheDocument();
    expect(screen.getByText('Bị lỡ')).toBeInTheDocument();
  });
});

describe('dialog nhắc nhở bị lỡ', () => {
  const renderDialog = () =>
    render(
      <Providers>
        <MemoryRouter>
          <MissedRemindersDialog />
          <Where />
        </MemoryRouter>
      </Providers>,
    );

  it('không có mục bị lỡ thì không hiện', async () => {
    renderDialog();
    await waitFor(() => expect(reminderMissedList).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hiện "Bạn đã lỡ N nhắc nhở"; Bỏ qua tất cả gọi reminderDismissAll', async () => {
    vi.mocked(reminderMissedList).mockResolvedValue([missed('a', 'Việc A'), missed('b', 'Việc B')]);
    vi.mocked(reminderDismissAll).mockResolvedValue();
    renderDialog();
    expect(await screen.findByText('Bạn đã lỡ 2 nhắc nhở')).toBeInTheDocument();
    expect(screen.getByText('Việc A')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua tất cả' }));
    await waitFor(() => expect(reminderDismissAll).toHaveBeenCalled());
  });

  it('Bỏ qua từng mục gọi reminderDismiss(id)', async () => {
    vi.mocked(reminderMissedList).mockResolvedValue([missed('a', 'Việc A')]);
    vi.mocked(reminderDismiss).mockResolvedValue();
    renderDialog();
    await userEvent.click(await screen.findByRole('button', { name: 'Bỏ qua nhắc nhở "Việc A"' }));
    await waitFor(() => expect(reminderDismiss).toHaveBeenCalledWith('a'));
  });

  it('Để sau: đóng dialog và ghi nhớ (không tự hiện lại)', async () => {
    vi.mocked(reminderMissedList).mockResolvedValue([missed('a', 'Việc A')]);
    renderDialog();
    await userEvent.click(await screen.findByRole('button', { name: 'Để sau' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useUiStore.getState().missedDeferred).toBe(true);
  });

  it('Mở: đi tới Task rồi đóng dialog', async () => {
    vi.mocked(reminderMissedList).mockResolvedValue([missed('a', 'Việc A')]);
    renderDialog();
    await userEvent.click(await screen.findByRole('button', { name: 'Mở "Việc A"' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/tasks/task-a');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('event từ core', () => {
  function Host() {
    useCoreEvents();
    return <Where />;
  }

  it('`navigate` mở đúng route', async () => {
    let handler: ((e: Navigate) => void) | undefined;
    vi.mocked(onNavigate).mockImplementation((h) => {
      handler = h;
      return Promise.resolve(() => {});
    });
    render(
      <Providers>
        <MemoryRouter initialEntries={['/today']}>
          <Host />
        </MemoryRouter>
      </Providers>,
    );
    await waitFor(() => expect(handler).toBeDefined());
    handler?.({ route: '/calendar?date=2026-11-27&event=e1' });
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/calendar?date=2026-11-27&event=e1'),
    );
  });
});
