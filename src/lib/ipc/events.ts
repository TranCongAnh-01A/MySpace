import type { UnlistenFn } from '@tauri-apps/api/event';
import { isMock, listenEvent } from '../tauri';
import type { EntityChanged } from './bindings/EntityChanged';
import type { Navigate, ReminderFired } from './contract';
import { subscribeMockEvents, subscribeMockNavigate, subscribeMockReminderFired } from './mock';

/** Nghe `entity-changed` do core phát (ở chế độ mock: do mock.ts phát). Trả về hàm huỷ đăng ký. */
export async function onEntityChanged(handler: (e: EntityChanged) => void): Promise<UnlistenFn> {
  if (isMock) return subscribeMockEvents(handler);
  return listenEvent<EntityChanged>('entity-changed', handler);
}

/** Core yêu cầu mở một route (bấm vào thông báo Windows). */
export async function onNavigate(handler: (e: Navigate) => void): Promise<UnlistenFn> {
  if (isMock) return subscribeMockNavigate(handler);
  return listenEvent<Navigate>('navigate', handler);
}

/** Một nhắc nhở vừa được gửi. */
export async function onReminderFired(handler: (e: ReminderFired) => void): Promise<UnlistenFn> {
  if (isMock) return subscribeMockReminderFired(handler);
  return listenEvent<ReminderFired>('reminder-fired', handler);
}
