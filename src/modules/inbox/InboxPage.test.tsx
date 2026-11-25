import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Providers } from '../../app/providers';
import type { InboxItem } from '../../lib/ipc/bindings/InboxItem';
import { inboxCreate, inboxList } from '../../lib/ipc/commands';
import { InboxPage } from './InboxPage';

vi.mock('../../lib/ipc/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/ipc/commands')>()),
  inboxList: vi.fn(),
  inboxCreate: vi.fn(),
}));
vi.mock('../../lib/ipc/events', () => ({
  onEntityChanged: vi.fn(() => Promise.resolve(() => {})),
}));

const item = (id: string, content: string): InboxItem => ({
  id,
  content,
  status: 'Open',
  createdAt: '2026-11-26T00:00:00.000Z',
});

function renderPage() {
  render(
    <Providers>
      <InboxPage />
    </Providers>,
  );
}

describe('InboxPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('hiện danh sách từ core', async () => {
    vi.mocked(inboxList).mockResolvedValue([item('1', 'mua sữa'), item('2', 'gọi khách')]);
    renderPage();
    expect(await screen.findByText('mua sữa')).toBeInTheDocument();
    expect(screen.getByText('gọi khách')).toBeInTheDocument();
  });

  it('hiện trạng thái trống', async () => {
    vi.mocked(inboxList).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Inbox trống.')).toBeInTheDocument();
  });

  it('gửi nội dung và tải lại danh sách khi thêm', async () => {
    vi.mocked(inboxList)
      .mockResolvedValueOnce([])
      .mockResolvedValue([item('1', 'việc mới')]);
    vi.mocked(inboxCreate).mockResolvedValue(item('1', 'việc mới'));
    renderPage();
    await screen.findByText('Inbox trống.');
    await userEvent.type(screen.getByLabelText('Thêm vào Inbox'), 'việc mới');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(vi.mocked(inboxCreate).mock.calls[0]?.[0]).toBe('việc mới');
    await waitFor(() => expect(screen.getByText('việc mới')).toBeInTheDocument());
  });

  it('hiện lỗi từ core', async () => {
    vi.mocked(inboxList).mockResolvedValue([]);
    vi.mocked(inboxCreate).mockRejectedValue({
      code: 'VALIDATION',
      message: 'Nội dung không được để trống',
    });
    renderPage();
    await screen.findByText('Inbox trống.');
    await userEvent.type(screen.getByLabelText('Thêm vào Inbox'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nội dung không được để trống');
  });
});
