import type { UnlistenFn } from '@tauri-apps/api/event';
import { isMock, listenEvent } from '../tauri';
import type { EntityChanged } from './bindings/EntityChanged';
import { subscribeMockEvents } from './mock';

/** Nghe `entity-changed` do core phát (ở chế độ mock: do mock.ts phát). Trả về hàm huỷ đăng ký. */
export async function onEntityChanged(handler: (e: EntityChanged) => void): Promise<UnlistenFn> {
  if (isMock) return subscribeMockEvents(handler);
  return listenEvent<EntityChanged>('entity-changed', handler);
}
