import type { AppError } from './bindings/AppError';
import type { InboxItem } from './bindings/InboxItem';
import type { InboxStatus } from './bindings/InboxStatus';

// Dữ liệu giả trong bộ nhớ, dùng khi chạy với VITE_IPC_MOCK=1 (không cần core Rust).
const items: InboxItem[] = [];

export function mockInboxList(status?: InboxStatus): Promise<InboxItem[]> {
  return Promise.resolve(items.filter((i) => !status || i.status === status));
}

export function mockInboxCreate(content: string): Promise<InboxItem> {
  const text = content.trim();
  if (!text) {
    const error: AppError = { code: 'VALIDATION', message: 'Nội dung không được để trống' };
    return Promise.reject(error);
  }
  const item: InboxItem = {
    id: crypto.randomUUID(),
    content: text,
    status: 'Open',
    createdAt: new Date().toISOString(),
  };
  items.unshift(item);
  return Promise.resolve(item);
}
