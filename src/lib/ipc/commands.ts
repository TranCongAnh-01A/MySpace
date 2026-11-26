import { invoke } from '@tauri-apps/api/core';
import { isMock } from '../tauri';
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
import * as mock from './mock';

export function inboxList(status?: InboxStatus): Promise<InboxItem[]> {
  if (isMock) return mock.mockInboxList(status);
  return invoke<InboxItem[]>('inbox_list', { status: status ?? null });
}

export function inboxCreate(content: string): Promise<InboxItem> {
  if (isMock) return mock.mockInboxCreate(content);
  return invoke<InboxItem>('inbox_create', { content });
}

export function appQuit(): Promise<void> {
  if (isMock) return Promise.resolve();
  return invoke<void>('app_quit');
}

// ---- v0.1: settings, areas, backup (hợp đồng B1 mục 2.1) ----

export function settingsGet(): Promise<AppSettings> {
  if (isMock) return mock.mockSettingsGet();
  return invoke<AppSettings>('settings_get');
}

export function settingsUpdate(patch: SettingsPatch): Promise<AppSettings> {
  if (isMock) return mock.mockSettingsUpdate(patch);
  return invoke<AppSettings>('settings_update', { patch });
}

export function shortcutRegister(accelerator: string): Promise<AppSettings> {
  if (isMock) return mock.mockShortcutRegister(accelerator);
  return invoke<AppSettings>('shortcut_register', { accelerator });
}

export function areaList(): Promise<Area[]> {
  if (isMock) return mock.mockAreaList();
  return invoke<Area[]>('area_list');
}

export function areaCreate(input: AreaCreate): Promise<Area> {
  if (isMock) return mock.mockAreaCreate(input);
  return invoke<Area>('area_create', { input });
}

export function areaUpdate(id: string, patch: AreaPatch): Promise<Area> {
  if (isMock) return mock.mockAreaUpdate(id, patch);
  return invoke<Area>('area_update', { id, patch });
}

/** `beforeId`: mục nằm ngay trên vị trí mới; `afterId`: mục nằm ngay dưới. */
export function areaReorder(id: string, beforeId?: string, afterId?: string): Promise<Area> {
  if (isMock) return mock.mockAreaReorder(id, beforeId, afterId);
  return invoke<Area>('area_reorder', { id, beforeId: beforeId ?? null, afterId: afterId ?? null });
}

export function areaDelete(id: string): Promise<void> {
  if (isMock) return mock.mockAreaDelete(id);
  return invoke<void>('area_delete', { id });
}

export function backupNow(): Promise<Backup> {
  if (isMock) return mock.mockBackupNow();
  return invoke<Backup>('backup_now');
}

export function backupList(): Promise<Backup[]> {
  if (isMock) return mock.mockBackupList();
  return invoke<Backup[]>('backup_list');
}

export function backupRestore(fileName: string): Promise<void> {
  if (isMock) return mock.mockBackupRestore(fileName);
  return invoke<void>('backup_restore', { fileName });
}

/** Trả về đường dẫn file, hoặc `null` khi người dùng huỷ hộp thoại. */
export function exportJson(): Promise<string | null> {
  if (isMock) return mock.mockExportJson();
  return invoke<string | null>('export_json');
}

export function openDataFolder(): Promise<void> {
  if (isMock) return Promise.resolve();
  return invoke<void>('open_data_folder');
}

export function openLogFolder(): Promise<void> {
  if (isMock) return Promise.resolve();
  return invoke<void>('open_log_folder');
}

export function appInfo(): Promise<AppInfo> {
  if (isMock) return mock.mockAppInfo();
  return invoke<AppInfo>('app_info');
}

/** Lấy thông báo hiển thị được từ lỗi của command (`AppError`) hoặc lỗi bất kỳ. */
export function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const { message } = e as { message: unknown };
    if (typeof message === 'string') return message;
  }
  if (typeof e === 'string' && e) return e;
  return 'Có lỗi xảy ra';
}

export function errorCode(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const { code } = e as { code: unknown };
    if (typeof code === 'string') return code;
  }
  return undefined;
}
