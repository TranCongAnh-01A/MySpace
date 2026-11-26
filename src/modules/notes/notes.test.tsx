import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appQuitReady } from '@/lib/ipc/commands';
import { onAppWillQuit } from '@/lib/ipc/events';
import { translate } from '@/lib/i18n';
import { useAppWillQuit } from '@/app/useAppWillQuit';
import { createSaveQueue, registerQueue } from './autosaveQueue';
import { ConflictDialog } from './ConflictDialog';

vi.mock('@/lib/ipc/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ipc/commands')>()),
  appQuitReady: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/ipc/events', () => ({
  onAppWillQuit: vi.fn(),
}));

const vi_ = (k: Parameters<typeof translate>[1]) => translate('vi', k);

describe('ConflictDialog', () => {
  const setup = () => {
    const onKeepMine = vi.fn(() => Promise.resolve());
    const onUseSaved = vi.fn(() => Promise.resolve());
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ConflictDialog open onKeepMine={onKeepMine} onUseSaved={onUseSaved} />
      </QueryClientProvider>,
    );
    return { onKeepMine, onUseSaved };
  };

  it('hiện tiêu đề và hai lựa chọn', () => {
    setup();
    expect(screen.getByText(vi_('notes.conflict.title'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: vi_('notes.conflict.mine') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: vi_('notes.conflict.theirs') })).toBeInTheDocument();
  });

  it('"Giữ bản của tôi" gọi onKeepMine', async () => {
    const { onKeepMine, onUseSaved } = setup();
    await userEvent.click(screen.getByRole('button', { name: vi_('notes.conflict.mine') }));
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect(onUseSaved).not.toHaveBeenCalled();
  });

  it('"Dùng bản đã lưu" gọi onUseSaved', async () => {
    const { onKeepMine, onUseSaved } = setup();
    await userEvent.click(screen.getByRole('button', { name: vi_('notes.conflict.theirs') }));
    expect(onUseSaved).toHaveBeenCalledTimes(1);
    expect(onKeepMine).not.toHaveBeenCalled();
  });
});

describe('app-will-quit', () => {
  let fire: () => void = () => {};
  beforeEach(() => {
    vi.mocked(appQuitReady).mockClear();
    vi.mocked(onAppWillQuit).mockImplementation((h) => {
      fire = h;
      return Promise.resolve(() => {});
    });
  });

  function Probe() {
    useAppWillQuit();
    return null;
  }

  it('không có thay đổi chưa lưu: gọi appQuitReady ngay', async () => {
    render(<Probe />);
    await waitFor(() => expect(onAppWillQuit).toHaveBeenCalled());
    fire();
    await waitFor(() => expect(appQuitReady).toHaveBeenCalledTimes(1));
  });

  it('có thay đổi chưa lưu: lưu xong rồi mới gọi appQuitReady', async () => {
    const order: string[] = [];
    const save = vi.fn(async (_p: unknown, v: number) => {
      order.push('save');
      return { version: v + 1 };
    });
    vi.mocked(appQuitReady).mockImplementation(() => {
      order.push('ready');
      return Promise.resolve();
    });
    const q = createSaveQueue({ save, isConflict: () => false, version: 1 });
    const unregister = registerQueue(q);
    q.schedule({ title: 't', contentJson: '{"type":"doc"}' });

    render(<Probe />);
    await waitFor(() => expect(onAppWillQuit).toHaveBeenCalled());
    fire();
    await waitFor(() => expect(appQuitReady).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['save', 'ready']);
    unregister();
  });
});
