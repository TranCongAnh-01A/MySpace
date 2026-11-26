// Kiểu tạm chép đúng hợp đồng v0.1 (docs/plan/lifehub_B1_impl_20261126.md mục 2.1).
// Phase C2 bước 0 sẽ chuyển sang `bindings/` do ts-rs sinh ra. KHÔNG tự thêm trường ở đây.
export type Theme = 'Dark' | 'Light' | 'System';
export type Language = 'vi' | 'en';
export type WeekStart = 'Mon' | 'Sun';
export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';

export type AppSettings = {
  theme: Theme;
  language: Language;
  timezone: string; // IANA
  dateFormat: DateFormat;
  weekStart: WeekStart;
  quickCaptureShortcut: string; // "Ctrl+Shift+Space"
  launchAtStartup: boolean;
  startHidden: boolean;
  closeToTray: boolean;
  notificationsEnabled: boolean;
  defaultReminderMinutes: number;
  trashRetentionDays: number;
};
export type SettingsPatch = Partial<AppSettings>;

export type Area = { id: string; name: string; color?: string; sortKey: string };
export type AreaCreate = { name: string; color?: string };
/** `color: ""` = xoá màu. */
export type AreaPatch = { name?: string; color?: string };

export type BackupReason = 'Manual' | 'Daily' | 'PreMigration' | 'PreRestore';
export type Backup = {
  fileName: string;
  reason: BackupReason;
  sizeBytes: number;
  createdAt: string;
};
export type AppInfo = { version: string; dataDir: string; logDir: string; backupDir: string };
