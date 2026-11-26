import type { AppError } from './bindings/AppError';
import type { EntityChanged } from './bindings/EntityChanged';
import type { InboxItem } from './bindings/InboxItem';
import type { InboxStatus } from './bindings/InboxStatus';
import type {
  AppInfo,
  AppSettings,
  Area,
  AreaCreate,
  AreaPatch,
  Backup,
  SettingsPatch,
} from './contract';

// Dữ liệu giả trong bộ nhớ, dùng khi chạy với VITE_IPC_MOCK=1 (không cần core Rust).
const LATENCY_MS = 150;
const delay = <T>(value: () => T): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(value());
      } catch (e) {
        reject(e);
      }
    }, LATENCY_MS),
  );
const fail = (code: AppError['code'], message: string): never => {
  const error: AppError = { code, message };
  throw error;
};

// ---- event ----
const listeners = new Set<(e: EntityChanged) => void>();
export function subscribeMockEvents(handler: (e: EntityChanged) => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}
function emit(entity: string, ids: string[] = []) {
  listeners.forEach((l) => l({ entity, ids }));
}

// ---- inbox ----
const items: InboxItem[] = [
  {
    id: 'mock-inbox-2',
    content: 'Gọi khách hàng GGStudio về bản demo',
    status: 'Open',
    createdAt: '2026-11-26T01:10:00.000Z',
  },
  {
    id: 'mock-inbox-1',
    content: 'Mua sữa\nvà trứng gà',
    status: 'Open',
    createdAt: '2026-11-25T08:00:00.000Z',
  },
];

export function mockInboxList(status?: InboxStatus): Promise<InboxItem[]> {
  return delay(() => items.filter((i) => !status || i.status === status));
}

export function mockInboxCreate(content: string): Promise<InboxItem> {
  return delay(() => {
    const text = content.trim();
    if (!text) fail('VALIDATION', 'Nội dung không được để trống');
    const item: InboxItem = {
      id: crypto.randomUUID(),
      content: text,
      status: 'Open',
      createdAt: new Date().toISOString(),
    };
    items.unshift(item);
    emit('inbox', [item.id]);
    return item;
  });
}

// ---- settings ----
let settings: AppSettings = {
  theme: 'System',
  language: 'vi',
  timezone: 'Asia/Ho_Chi_Minh',
  dateFormat: 'DD/MM/YYYY',
  weekStart: 'Mon',
  quickCaptureShortcut: 'Ctrl+Shift+Space',
  launchAtStartup: false,
  startHidden: false,
  closeToTray: true,
  notificationsEnabled: true,
  defaultReminderMinutes: 15,
  trashRetentionDays: 30,
};

function checkAccelerator(accelerator: string) {
  const parts = accelerator.split('+').map((p) => p.trim());
  const key = parts[parts.length - 1] ?? '';
  if (!key || parts.length < 2) fail('VALIDATION', 'Không đọc được tổ hợp phím');
  if (accelerator === 'Alt+F4') fail('CONFLICT', 'Tổ hợp phím này đã bị ứng dụng khác chiếm');
}

export function mockSettingsGet(): Promise<AppSettings> {
  return delay(() => ({ ...settings }));
}

export function mockSettingsUpdate(patch: SettingsPatch): Promise<AppSettings> {
  return delay(() => {
    if (patch.quickCaptureShortcut !== undefined) checkAccelerator(patch.quickCaptureShortcut);
    settings = { ...settings, ...patch };
    emit('settings');
    return { ...settings };
  });
}

export function mockShortcutRegister(accelerator: string): Promise<AppSettings> {
  return delay(() => {
    checkAccelerator(accelerator);
    settings = { ...settings, quickCaptureShortcut: accelerator };
    emit('settings');
    return { ...settings };
  });
}

// ---- areas ----
let areas: Area[] = [
  { id: 'mock-area-1', name: 'Học tập', color: '#A08BDF', sortKey: '00001' },
  { id: 'mock-area-2', name: 'Cá nhân', color: '#63BB91', sortKey: '00002' },
  { id: 'mock-area-3', name: 'Sức khoẻ', color: '#EAB75C', sortKey: '00003' },
];
const resort = () => {
  areas = areas.map((a, i) => ({ ...a, sortKey: String(i + 1).padStart(5, '0') }));
};
const findArea = (id: string): Area =>
  areas.find((a) => a.id === id) ?? fail('NOT_FOUND', 'Không tìm thấy lĩnh vực');
const validName = (name: string) => {
  const n = name.trim();
  if (!n) fail('VALIDATION', 'Tên lĩnh vực không được để trống');
  return n;
};

export function mockAreaList(): Promise<Area[]> {
  return delay(() => areas.map((a) => ({ ...a })));
}

export function mockAreaCreate(input: AreaCreate): Promise<Area> {
  return delay(() => {
    const area: Area = {
      id: crypto.randomUUID(),
      name: validName(input.name),
      ...(input.color ? { color: input.color } : {}),
      sortKey: '',
    };
    areas = [...areas, area];
    resort();
    emit('area', [area.id]);
    return { ...findArea(area.id) };
  });
}

export function mockAreaUpdate(id: string, patch: AreaPatch): Promise<Area> {
  return delay(() => {
    const next: Area = { ...findArea(id) };
    if (patch.name !== undefined) next.name = validName(patch.name);
    if (patch.color !== undefined) {
      if (patch.color === '') delete next.color;
      else next.color = patch.color;
    }
    areas = areas.map((a) => (a.id === id ? next : a));
    emit('area', [id]);
    return { ...next };
  });
}

export function mockAreaReorder(id: string, beforeId?: string, afterId?: string): Promise<Area> {
  return delay(() => {
    const moving = findArea(id);
    const rest = areas.filter((a) => a.id !== id);
    let index = rest.length;
    if (beforeId) index = rest.findIndex((a) => a.id === beforeId) + 1;
    else if (afterId) index = rest.findIndex((a) => a.id === afterId);
    rest.splice(Math.max(0, index), 0, moving);
    areas = rest;
    resort();
    emit('area', [id]);
    return { ...findArea(id) };
  });
}

export function mockAreaDelete(id: string): Promise<void> {
  return delay(() => {
    findArea(id);
    areas = areas.filter((a) => a.id !== id);
    emit('area', [id]);
  });
}

// ---- backup ----
let backups: Backup[] = [
  {
    fileName: 'lifehub-20261126-020000-daily.db',
    reason: 'Daily',
    sizeBytes: 184_320,
    createdAt: '2026-11-26T02:00:00.000Z',
  },
  {
    fileName: 'lifehub-20261125-020000-daily.db',
    reason: 'Daily',
    sizeBytes: 151_552,
    createdAt: '2026-11-25T02:00:00.000Z',
  },
];

export function mockBackupNow(): Promise<Backup> {
  return delay(() => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const b: Backup = {
      fileName: `lifehub-${stamp}-manual.db`,
      reason: 'Manual',
      sizeBytes: 190_464,
      createdAt: now.toISOString(),
    };
    backups = [b, ...backups];
    return b;
  });
}

export function mockBackupList(): Promise<Backup[]> {
  return delay(() => backups.map((b) => ({ ...b })));
}

export function mockBackupRestore(fileName: string): Promise<void> {
  return delay(() => {
    if (!backups.some((b) => b.fileName === fileName))
      fail('NOT_FOUND', 'Không tìm thấy bản sao lưu');
    // Core thật sẽ khởi động lại app; mock thì tải lại trang.
    setTimeout(() => window.location.reload(), 50);
  });
}

export function mockExportJson(): Promise<string | null> {
  return delay(() => 'C:\\Users\\demo\\Documents\\LifeHub\\lifehub-export-20261126.json');
}

export function mockAppInfo(): Promise<AppInfo> {
  return delay(() => ({
    version: '0.1.0',
    dataDir: 'C:\\Users\\demo\\AppData\\Roaming\\LifeHub',
    logDir: 'C:\\Users\\demo\\AppData\\Roaming\\LifeHub\\logs',
    backupDir: 'C:\\Users\\demo\\AppData\\Roaming\\LifeHub\\backups',
  }));
}
