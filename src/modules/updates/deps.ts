import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { backupNow } from '@/lib/ipc/commands';
import { flushAllQueues } from '@/modules/notes/autosaveQueue';
import type { UpdaterDeps } from './updater';

/** Bản thật. Plugin tự kiểm tra chữ ký trước khi chạy bộ cài; không có đường tắt nào bỏ qua nó. */
export const realDeps: UpdaterDeps = {
  check: () => check(),
  flushNotes: flushAllQueues,
  backup: backupNow,
  relaunch,
};
