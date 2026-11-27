import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { UpdateDialog } from './UpdateDialog';
import { resetUpdateStore, useUpdateStore } from './store';
import { installUpdate, type UpdateHandle, type UpdaterDeps } from './updater';

const realDepsMock = vi.hoisted(() => ({
  deps: {} as UpdaterDeps,
}));
vi.mock('./deps', () => ({
  get realDeps() {
    return realDepsMock.deps;
  },
}));

function makeUpdate(calls: string[], opts: { fail?: boolean } = {}): UpdateHandle {
  return {
    version: '0.9.1',
    body: 'Sửa lỗi nhỏ <b>không render HTML</b>',
    downloadAndInstall: vi.fn(async (onEvent) => {
      calls.push('install');
      onEvent({ event: 'Started', data: { contentLength: 200 } });
      onEvent({ event: 'Progress', data: { chunkLength: 50 } });
      onEvent({ event: 'Progress', data: { chunkLength: 150 } });
      onEvent({ event: 'Finished' });
      if (opts.fail) throw new Error('chữ ký không hợp lệ');
    }),
  };
}

function makeDeps(calls: string[], over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    check: vi.fn(() => Promise.resolve(null)),
    flushNotes: vi.fn(async () => {
      calls.push('flush');
    }),
    backup: vi.fn(async () => {
      calls.push('backup');
    }),
    relaunch: vi.fn(async () => {
      calls.push('relaunch');
    }),
    ...over,
  };
}

beforeEach(() => {
  resetUpdateStore();
  vi.useRealTimers();
});

describe('installUpdate', () => {
  it('lưu Note → sao lưu → cài → khởi động lại, đúng thứ tự', async () => {
    const calls: string[] = [];
    const percents: Array<number | null> = [];
    await installUpdate(makeUpdate(calls), makeDeps(calls), (p) => percents.push(p));
    expect(calls).toEqual(['flush', 'backup', 'install', 'relaunch']);
    expect(percents).toEqual([null, 25, 100, 100]);
  });

  it('sao lưu lỗi thì không cài', async () => {
    const calls: string[] = [];
    const update = makeUpdate(calls);
    const deps = makeDeps(calls, { backup: vi.fn(() => Promise.reject(new Error('đầy ổ đĩa'))) });
    await expect(installUpdate(update, deps, () => undefined)).rejects.toThrow('đầy ổ đĩa');
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(deps.relaunch).not.toHaveBeenCalled();
  });

  it('lưu Note treo quá 1,5 giây thì vẫn sao lưu và cài', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const deps = makeDeps(calls, { flushNotes: () => new Promise<void>(() => undefined) });
    const run = installUpdate(makeUpdate(calls), deps, () => undefined);
    await vi.advanceTimersByTimeAsync(1500);
    await run;
    expect(calls).toEqual(['backup', 'install', 'relaunch']);
  });

  it('lưu Note lỗi không chặn cập nhật', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { flushNotes: () => Promise.reject(new Error('x')) });
    await installUpdate(makeUpdate(calls), deps, () => undefined);
    expect(calls).toEqual(['backup', 'install', 'relaunch']);
  });
});

describe('useUpdateStore', () => {
  it('không có bản mới: trạng thái "none", không có bản để hiện', async () => {
    const deps = makeDeps([]);
    await useUpdateStore.getState().check(deps);
    expect(useUpdateStore.getState().status).toBe('none');
    expect(useUpdateStore.getState().update).toBeNull();
  });

  it('tự kiểm tra lúc khởi động lỗi thì im lặng (không có lỗi để hiện)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const deps = makeDeps([], { check: () => Promise.reject(new Error('không có mạng')) });
    await useUpdateStore.getState().check(deps, { silent: true });
    const s = useUpdateStore.getState();
    expect(s.status).toBe('idle');
    expect(s.error).toBeNull();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it('người dùng bấm kiểm tra mà lỗi thì hiện lỗi', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const deps = makeDeps([], { check: () => Promise.reject(new Error('không có mạng')) });
    await useUpdateStore.getState().check(deps);
    expect(useUpdateStore.getState()).toMatchObject({
      status: 'error',
      error: 'không có mạng',
      errorStage: 'check',
    });
    info.mockRestore();
  });
});

describe('UpdateDialog', () => {
  function renderDialog(deps: UpdaterDeps) {
    realDepsMock.deps = deps;
    return render(
      <Providers>
        <UpdateDialog />
      </Providers>,
    );
  }

  it('không có bản mới thì không hiện dialog', async () => {
    renderDialog(makeDeps([]));
    await useUpdateStore.getState().check(realDepsMock.deps);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('có bản mới: hiện số phiên bản và ghi chú dạng văn bản thuần; "Để sau" ẩn dialog', async () => {
    const calls: string[] = [];
    const update = makeUpdate(calls);
    renderDialog(makeDeps(calls, { check: () => Promise.resolve(update) }));
    await useUpdateStore.getState().check(realDepsMock.deps);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('0.9.1');
    expect(dialog).toHaveTextContent('<b>không render HTML</b>');
    expect(dialog.querySelector('b')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('bấm "Cập nhật và khởi động lại": chạy đủ quy trình', async () => {
    const calls: string[] = [];
    const update = makeUpdate(calls);
    renderDialog(makeDeps(calls, { check: () => Promise.resolve(update) }));
    await useUpdateStore.getState().check(realDepsMock.deps);
    await userEvent.click(await screen.findByRole('button', { name: 'Cập nhật và khởi động lại' }));
    await waitFor(() => expect(calls).toEqual(['flush', 'backup', 'install', 'relaunch']));
  });

  it('lỗi khi cài thì hiện "Không cập nhật được" và cho thử lại', async () => {
    const calls: string[] = [];
    const update = makeUpdate(calls, { fail: true });
    renderDialog(makeDeps(calls, { check: () => Promise.resolve(update) }));
    await useUpdateStore.getState().check(realDepsMock.deps);
    await userEvent.click(await screen.findByRole('button', { name: 'Cập nhật và khởi động lại' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không cập nhật được: chữ ký không hợp lệ',
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeEnabled();
    expect(calls).not.toContain('relaunch');
  });
});
