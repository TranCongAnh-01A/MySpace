// Điều phối cập nhật: kiểm tra, rồi lưu Note → sao lưu → tải và cài. Không import trực tiếp plugin,
// mọi thứ đi qua `UpdaterDeps` để test được (xem `deps.ts` cho bản thật).

export type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number | undefined } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

export type UpdateHandle = {
  version: string;
  body?: string | undefined;
  downloadAndInstall: (onEvent: (e: DownloadEvent) => void) => Promise<void>;
};

export type UpdaterDeps = {
  check: () => Promise<UpdateHandle | null>;
  /** Lưu mọi Note đang dở (`flushAllQueues`). */
  flushNotes: () => Promise<void>;
  /** Tạo bản sao lưu ngay (`backup_now`). */
  backup: () => Promise<unknown>;
  relaunch: () => Promise<void>;
};

/** Chờ lưu Note tối đa bằng thời gian core chờ `app_quit_ready`. */
export const FLUSH_TIMEOUT_MS = 1500;

export function checkForUpdate(deps: Pick<UpdaterDeps, 'check'>): Promise<UpdateHandle | null> {
  return deps.check();
}

async function flushWithTimeout(flush: () => Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    // Lưu Note lỗi không chặn cập nhật (giống lúc thoát app); sao lưu bên dưới mới là chốt an toàn.
    await Promise.race([flush().catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Thứ tự cố định: (1) lưu Note, (2) sao lưu, (3) tải + cài. Sao lưu lỗi thì ném lỗi và KHÔNG cài.
 * `onProgress` nhận phần trăm 0–100, hoặc `null` khi không biết tổng dung lượng.
 */
export async function installUpdate(
  update: UpdateHandle,
  deps: UpdaterDeps,
  onProgress: (percent: number | null) => void,
): Promise<void> {
  await flushWithTimeout(deps.flushNotes, FLUSH_TIMEOUT_MS);
  await deps.backup();

  let total: number | undefined;
  let done = 0;
  onProgress(null);
  await update.downloadAndInstall((e) => {
    if (e.event === 'Started') {
      total = e.data.contentLength;
    } else if (e.event === 'Progress') {
      done += e.data.chunkLength;
      onProgress(total ? Math.min(100, Math.round((done / total) * 100)) : null);
    } else {
      onProgress(100);
    }
  });
  // Bộ cài passive trên Windows tự đóng app; relaunch phòng khi app chưa bị đóng.
  await deps.relaunch();
}
