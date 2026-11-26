import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Providers } from '../../app/providers';
import { projectArchive, projectDelete, settingsGet, taskList } from '../../lib/ipc/commands';
import type { Project, ProjectProgress } from '../../lib/ipc/contract';
import { ProgressBar } from './ProgressBar';
import { RetireProjectDialog } from './ProjectDialogs';

vi.mock('../../lib/ipc/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/ipc/commands')>()),
  projectArchive: vi.fn(),
  projectDelete: vi.fn(),
  taskList: vi.fn(),
  settingsGet: vi.fn(),
}));
vi.mock('../../lib/ipc/events', () => ({
  onEntityChanged: vi.fn(() => Promise.resolve(() => {})),
}));

const progress = (over: Partial<ProjectProgress>): ProjectProgress => ({
  projectId: 'p1',
  name: 'GGStudio',
  done: 26,
  total: 40,
  percent: 65,
  ...over,
});

const project: Project = {
  id: 'p1',
  name: 'GGStudio',
  description: '',
  status: 'Active',
  sortKey: '00001',
  version: 1,
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(settingsGet).mockRejectedValue(new Error('chưa có settings'));
});

describe('ProgressBar', () => {
  it('có percent: hiện "26/40 việc · 65%" và progressbar 65', () => {
    render(
      <Providers>
        <ProgressBar progress={progress({})} />
      </Providers>,
    );
    expect(screen.getByText('26/40 việc · 65%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '65');
  });

  it('không có percent: hiện "Chưa có công việc", không hiện 0%', () => {
    const empty: ProjectProgress = { projectId: 'p2', name: 'Trống', done: 0, total: 0 };
    render(
      <Providers>
        <ProgressBar progress={empty} />
      </Providers>,
    );
    expect(screen.getByText('Chưa có công việc')).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

function renderRetire(kind: 'archive' | 'delete') {
  vi.mocked(taskList).mockResolvedValue(Array.from({ length: 3 }, () => ({}) as never));
  render(
    <Providers>
      <MemoryRouter>
        <RetireProjectDialog project={project} kind={kind} onClose={() => {}} />
      </MemoryRouter>
    </Providers>,
  );
}

describe('RetireProjectDialog', () => {
  it('mặc định giữ công việc (Detach)', async () => {
    vi.mocked(projectArchive).mockResolvedValue();
    renderRetire('archive');
    expect(await screen.findByLabelText(/Giữ công việc/)).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await waitFor(() => expect(projectArchive).toHaveBeenCalledWith('p1', 'Detach'));
  });

  it('chọn lưu trữ cả công việc (WithChildren) kèm số lượng', async () => {
    vi.mocked(projectArchive).mockResolvedValue();
    renderRetire('archive');
    await userEvent.click(await screen.findByLabelText('Lưu trữ cả 3 công việc'));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await waitFor(() => expect(projectArchive).toHaveBeenCalledWith('p1', 'WithChildren'));
  });

  it('xoá cũng gửi mode đã chọn', async () => {
    vi.mocked(projectDelete).mockResolvedValue();
    renderRetire('delete');
    await userEvent.click(await screen.findByLabelText('Xóa cả 3 công việc'));
    await userEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(projectDelete).toHaveBeenCalledWith('p1', 'WithChildren'));
  });
});
