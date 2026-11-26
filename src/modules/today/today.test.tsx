import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Providers } from '../../app/providers';
import {
  dashboardToday,
  projectList,
  reminderMissedList,
  settingsGet,
  taskSetStatus,
} from '../../lib/ipc/commands';
import type { Task, TodayView } from '../../lib/ipc/contract';
import { msUntilMidnight, todayHeading, useMidnightRefresh } from './hooks';
import { TodayPage } from './TodayPage';

vi.mock('../../lib/ipc/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/ipc/commands')>()),
  dashboardToday: vi.fn(),
  projectList: vi.fn(),
  reminderMissedList: vi.fn(),
  settingsGet: vi.fn(),
  taskSetStatus: vi.fn(),
}));
vi.mock('../../lib/ipc/events', () => ({
  onEntityChanged: vi.fn(() => Promise.resolve(() => {})),
}));

const task = (id: string, title: string): Task => ({
  id,
  title,
  description: '',
  status: 'Todo',
  priority: 'Medium',
  sortKey: '1',
  tagIds: [],
  checklistDone: 0,
  checklistTotal: 0,
  version: 1,
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
  dueDate: '2026-11-26',
});

const view = (today: Task[]): TodayView => ({
  date: '2026-11-26',
  today,
  overdue: [],
  upcoming: [],
  activeProjects: [{ projectId: 'p1', name: 'GGStudio', done: 26, total: 40, percent: 65 }],
  recentNotes: [],
  schedule: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(settingsGet).mockRejectedValue(new Error('chưa có settings'));
  vi.mocked(projectList).mockResolvedValue([]);
  vi.mocked(reminderMissedList).mockResolvedValue([]);
});

describe('Today', () => {
  it('hiện tiến độ dự án 26/40 · 65% và tiêu đề có thứ + ngày', async () => {
    vi.mocked(dashboardToday).mockResolvedValue(view([task('t1', 'Viết báo cáo')]));
    render(
      <Providers>
        <MemoryRouter>
          <TodayPage />
        </MemoryRouter>
      </Providers>,
    );
    expect(await screen.findByText('26/40 việc · 65%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hôm nay, Thứ Năm 26/11');
  });

  it('đánh Done: việc biến mất ngay và Today được tải lại', async () => {
    vi.mocked(dashboardToday)
      .mockResolvedValueOnce(view([task('t1', 'Viết báo cáo')]))
      .mockResolvedValue(view([]));
    vi.mocked(taskSetStatus).mockResolvedValue({
      task: { ...task('t1', 'Viết báo cáo'), status: 'Done' },
    });
    render(
      <Providers>
        <MemoryRouter>
          <TodayPage />
        </MemoryRouter>
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('checkbox', { name: /Viết báo cáo/ }));
    await waitFor(() => expect(taskSetStatus).toHaveBeenCalledWith('t1', 'Done'));
    await waitFor(() => expect(screen.queryByText('Viết báo cáo')).not.toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(dashboardToday).mock.calls.length).toBeGreaterThan(1));
  });
});

describe('qua nửa đêm', () => {
  it('msUntilMidnight tính theo múi giờ Settings', () => {
    // 16:30 UTC = 23:30 ở Asia/Ho_Chi_Minh → còn 30 phút
    expect(msUntilMidnight('Asia/Ho_Chi_Minh', new Date('2026-11-26T16:30:00Z'))).toBe(30 * 60_000);
    // cùng thời điểm đó ở UTC còn 7h30
    expect(msUntilMidnight('UTC', new Date('2026-11-26T16:30:00Z'))).toBe(450 * 60_000);
  });

  it('hẹn giờ 00:00 rồi invalidate [today] (giờ giả)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-26T16:59:00Z'));
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useMidnightRefresh('Asia/Ho_Chi_Minh'), { wrapper });
    expect(spy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['today'] });
    vi.useRealTimers();
  });

  it('todayHeading theo dateFormat', () => {
    expect(todayHeading('2026-11-26', 'vi', 'DD/MM/YYYY')).toBe('Thứ Năm 26/11');
    expect(todayHeading('2026-11-26', 'en', 'MM/DD/YYYY')).toBe('Thursday 11/26');
  });
});
