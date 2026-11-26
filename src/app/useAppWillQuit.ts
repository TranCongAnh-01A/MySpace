import { useEffect } from 'react';
import { appQuitReady } from '@/lib/ipc/commands';
import { onAppWillQuit } from '@/lib/ipc/events';
import { flushAllQueues } from '@/modules/notes/autosaveQueue';

/**
 * Core sắp thoát hẳn (`app-will-quit`): lưu mọi Note đang dở rồi báo `app_quit_ready`.
 * Không có gì chưa lưu thì báo ngay; lỗi lưu cũng không chặn thoát (core tự thoát sau 1,5 giây).
 */
export function useAppWillQuit() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onAppWillQuit(() => {
      void flushAllQueues()
        .catch(() => undefined)
        .finally(() => void appQuitReady());
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
