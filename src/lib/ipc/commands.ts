import { invoke } from '@tauri-apps/api/core';
import type { InboxItem } from './bindings/InboxItem';
import type { InboxStatus } from './bindings/InboxStatus';
import { mockInboxCreate, mockInboxList } from './mock';

const useMock = import.meta.env.VITE_IPC_MOCK === '1';

export function inboxList(status?: InboxStatus): Promise<InboxItem[]> {
  if (useMock) return mockInboxList(status);
  return invoke<InboxItem[]>('inbox_list', { status: status ?? null });
}

export function inboxCreate(content: string): Promise<InboxItem> {
  if (useMock) return mockInboxCreate(content);
  return invoke<InboxItem>('inbox_create', { content });
}

export function appQuit(): Promise<void> {
  if (useMock) return Promise.resolve();
  return invoke<void>('app_quit');
}

/** Lấy thông báo hiển thị được từ lỗi của command (`AppError`) hoặc lỗi bất kỳ. */
export function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const { message } = e as { message: unknown };
    if (typeof message === 'string') return message;
  }
  return 'Có lỗi xảy ra';
}
