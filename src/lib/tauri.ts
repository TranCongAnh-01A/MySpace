// Gom mọi API Tauri vào đây và bọc kiểm tra, để chạy được trong trình duyệt thường (VITE_IPC_MOCK=1) và trong test.
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const isMock = import.meta.env.VITE_IPC_MOCK === '1';

/** Đang chạy trong WebView của Tauri (không phải trình duyệt thường / jsdom). */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const canUseWindow = () => !isMock && isTauriRuntime();

export const appWindow = {
  minimize: async () => {
    if (canUseWindow()) await getCurrentWindow().minimize();
  },
  toggleMaximize: async () => {
    if (canUseWindow()) await getCurrentWindow().toggleMaximize();
  },
  close: async () => {
    if (canUseWindow()) await getCurrentWindow().close();
  },
  hide: async () => {
    if (canUseWindow()) await getCurrentWindow().hide();
  },
  onFocusChanged: async (handler: (focused: boolean) => void): Promise<UnlistenFn> => {
    if (!canUseWindow()) return () => {};
    return getCurrentWindow().onFocusChanged(({ payload }) => handler(payload));
  },
};

export async function listenEvent<T>(
  name: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!canUseWindow()) return () => {};
  return listen<T>(name, (event) => handler(event.payload));
}
