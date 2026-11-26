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

const mockQuitListeners = new Set<() => void>();
/** Mock: cho thử `app-will-quit` bằng `window.__lifehubMock.fireWillQuit()`. */
export function fireMockWillQuit() {
  mockQuitListeners.forEach((l) => l());
}
if (isMock && typeof window !== 'undefined') {
  const w = window as unknown as { __lifehubMock?: Record<string, unknown> };
  w.__lifehubMock = { ...w.__lifehubMock, fireWillQuit: fireMockWillQuit };
}

/** Core sắp thoát hẳn: lưu mọi thứ đang dở rồi gọi `appQuitReady`. */
export async function onAppWillQuit(handler: () => void): Promise<UnlistenFn> {
  if (isMock) {
    mockQuitListeners.add(handler);
    return () => {
      mockQuitListeners.delete(handler);
    };
  }
  return listenEvent<null>('app-will-quit', () => handler());
}
