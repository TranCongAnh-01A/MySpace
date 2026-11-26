import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveQueue, flushAllQueues, registerQueue, type SavePayload } from './autosaveQueue';

const conflict = { code: 'CONFLICT', message: 'x' };
const pay = (n: number): SavePayload => ({ title: 't', contentJson: `c${n}` });

function setup(
  save: (p: SavePayload, v: number) => Promise<{ version: number }>,
  extra: { maxRetries?: number } = {},
) {
  return createSaveQueue({
    save,
    isConflict: (e) => (e as { code?: string })?.code === 'CONFLICT',
    version: 1,
    ...extra,
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('hàng đợi lưu Note', () => {
  it('lưu sau 1 giây không gõ, gộp nhiều lần gõ thành một', async () => {
    const save = vi.fn(async (_p: SavePayload, v: number) => ({ version: v + 1 }));
    const q = setup(save);
    q.schedule(pay(1));
    await vi.advanceTimersByTimeAsync(600);
    q.schedule(pay(2)); // gõ tiếp: hẹn lại
    await vi.advanceTimersByTimeAsync(600);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(pay(2), 1);
    expect(q.snapshot.status).toBe('saved');
    expect(q.version).toBe(2);
  });

  it('mỗi lúc chỉ một lần lưu; thay đổi mới xếp hàng, dùng version của lần trước', async () => {
    let release: (() => void) | undefined;
    let inFlight = 0;
    let maxInFlight = 0;
    const save = vi.fn(async (_p: SavePayload, v: number) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((r) => (release = r));
      inFlight -= 1;
      return { version: v + 1 };
    });
    const q = setup(save);
    q.schedule(pay(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(q.snapshot.status).toBe('saving');
    q.schedule(pay(2)); // trong lúc đang lưu
    q.schedule(pay(3));
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1); // chưa lưu lần hai khi lần một chưa xong
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(pay(3), 2); // baseVersion = kết quả lần trước
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(maxInFlight).toBe(1);
    expect(q.snapshot.status).toBe('saved');
    expect(q.version).toBe(3);
  });

  it('flush lưu ngay, không chờ debounce', async () => {
    const save = vi.fn(async (_p: SavePayload, v: number) => ({ version: v + 1 }));
    const q = setup(save);
    q.schedule(pay(1));
    await q.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(q.hasUnsaved()).toBe(false);
  });

  it('lỗi: giữ nội dung, thử lại sau 5 giây, tối đa 3 lần', async () => {
    const save = vi.fn(async () => {
      throw new Error('mạng');
    });
    const q = setup(save);
    q.schedule(pay(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(q.snapshot.status).toBe('error');
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(4); // 1 lần đầu + 3 lần thử lại
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).toHaveBeenCalledTimes(4);
    expect(q.snapshot.status).toBe('error');
    expect(q.hasUnsaved()).toBe(true); // nội dung vẫn còn

    save.mockImplementation(async () => ({ version: 9 }) as never);
    await q.retry(); // nút "Thử lại"
    expect(q.snapshot.status).toBe('saved');
    expect(save).toHaveBeenLastCalledWith(pay(1), 1);
  });

  it('CONFLICT: dừng, giữ bản của tôi thì lưu đè bằng version mới', async () => {
    const save = vi
      .fn<(p: SavePayload, v: number) => Promise<{ version: number }>>()
      .mockRejectedValueOnce(conflict)
      .mockImplementation(async (_p, v) => ({ version: v + 1 }));
    const q = setup(save);
    q.schedule(pay(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(q.snapshot.status).toBe('conflict');
    q.schedule(pay(2)); // gõ tiếp khi đang xung đột: không tự lưu
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);

    await q.resolveKeepMine(7);
    expect(save).toHaveBeenLastCalledWith(pay(2), 7);
    expect(q.snapshot.status).toBe('saved');
    expect(q.version).toBe(8);
  });

  it('CONFLICT: dùng bản đã lưu thì bỏ thay đổi', async () => {
    const save = vi.fn().mockRejectedValueOnce(conflict);
    const q = setup(save);
    q.schedule(pay(1));
    await vi.advanceTimersByTimeAsync(1000);
    q.resolveUseSaved(5);
    expect(q.snapshot.status).toBe('idle');
    expect(q.hasUnsaved()).toBe(false);
    expect(q.version).toBe(5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushAllQueues lưu mọi hàng đợi đã đăng ký (app-will-quit)', async () => {
    const save = vi.fn(async (_p: SavePayload, v: number) => ({ version: v + 1 }));
    const q = setup(save);
    const unregister = registerQueue(q);
    q.schedule(pay(1));
    await flushAllQueues();
    expect(save).toHaveBeenCalledTimes(1);
    expect(q.hasUnsaved()).toBe(false);
    unregister();
    await expect(flushAllQueues()).resolves.toBeUndefined(); // không còn gì: xong ngay
  });
});
