import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { EntityChanged } from './bindings/EntityChanged';

/** Nghe `entity-changed` do core phát. Trả về hàm huỷ đăng ký. */
export async function onEntityChanged(handler: (e: EntityChanged) => void): Promise<UnlistenFn> {
  if (import.meta.env.VITE_IPC_MOCK === '1') return () => {};
  return listen<EntityChanged>('entity-changed', (event) => handler(event.payload));
}
