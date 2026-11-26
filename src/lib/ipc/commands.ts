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
  ChecklistItem,
  ChildMode,
  Project,
  ProjectCreate,
  ProjectOverview,
  ProjectPatch,
  SearchHit,
  SearchKind,
  SettingsPatch,
  Tag,
  TagCreate,
  TagPatch,
  Task,
  TaskCreate,
  TaskDetail,
  TaskFilter,
  TaskPatch,
  TaskStatus,
  TaskStatusResult,
  TodayView,
  TrashItem,
  TrashKind,
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

// ---- v0.2: inbox, tasks, checklist, tags, trash, search (hợp đồng B2 mục 2.1) ----

export function inboxUpdate(id: string, content: string): Promise<InboxItem> {
  if (isMock) return mock.mockInboxUpdate(id, content);
  return invoke<InboxItem>('inbox_update', { id, content });
}

export function inboxDelete(id: string): Promise<void> {
  if (isMock) return mock.mockInboxDelete(id);
  return invoke<void>('inbox_delete', { id });
}

export function inboxConvertToTask(id: string, task: TaskCreate): Promise<Task> {
  if (isMock) return mock.mockInboxConvertToTask(id, task);
  return invoke<Task>('inbox_convert_to_task', { id, task });
}

export function taskList(filter: TaskFilter = {}): Promise<Task[]> {
  if (isMock) return mock.mockTaskList(filter);
  return invoke<Task[]>('task_list', { filter });
}

export function taskGet(id: string): Promise<TaskDetail> {
  if (isMock) return mock.mockTaskGet(id);
  return invoke<TaskDetail>('task_get', { id });
}

export function taskCreate(input: TaskCreate): Promise<Task> {
  if (isMock) return mock.mockTaskCreate(input);
  return invoke<Task>('task_create', { input });
}

export function taskUpdate(id: string, patch: TaskPatch, baseVersion: number): Promise<Task> {
  if (isMock) return mock.mockTaskUpdate(id, patch, baseVersion);
  return invoke<Task>('task_update', { id, patch, baseVersion });
}

export function taskSetStatus(id: string, status: TaskStatus): Promise<TaskStatusResult> {
  if (isMock) return mock.mockTaskSetStatus(id, status);
  return invoke<TaskStatusResult>('task_set_status', { id, status });
}

/** `beforeId`/`afterId`: Task nằm ngay trên/dưới vị trí mới trong cột đích. */
export function taskMove(
  id: string,
  status: TaskStatus,
  beforeId?: string,
  afterId?: string,
): Promise<TaskStatusResult> {
  if (isMock) return mock.mockTaskMove(id, status, beforeId, afterId);
  return invoke<TaskStatusResult>('task_move', {
    id,
    status,
    beforeId: beforeId ?? null,
    afterId: afterId ?? null,
  });
}

export function taskArchive(id: string): Promise<void> {
  if (isMock) return mock.mockTaskArchive(id, true);
  return invoke<void>('task_archive', { id });
}

export function taskUnarchive(id: string): Promise<void> {
  if (isMock) return mock.mockTaskArchive(id, false);
  return invoke<void>('task_unarchive', { id });
}

export function taskDelete(id: string): Promise<void> {
  if (isMock) return mock.mockTaskDelete(id);
  return invoke<void>('task_delete', { id });
}

export function trashList(): Promise<TrashItem[]> {
  if (isMock) return mock.mockTrashList();
  return invoke<TrashItem[]>('trash_list');
}

export function trashRestore(kind: TrashKind, id: string): Promise<void> {
  if (isMock) return mock.mockTrashRestore(kind, id);
  return invoke<void>('trash_restore', { kind, id });
}

export function trashEmpty(): Promise<void> {
  if (isMock) return mock.mockTrashEmpty();
  return invoke<void>('trash_empty');
}

export function checklistAdd(taskId: string, content: string): Promise<ChecklistItem> {
  if (isMock) return mock.mockChecklistAdd(taskId, content);
  return invoke<ChecklistItem>('checklist_add', { taskId, content });
}

export function checklistUpdate(id: string, content: string): Promise<ChecklistItem> {
  if (isMock) return mock.mockChecklistUpdate(id, content);
  return invoke<ChecklistItem>('checklist_update', { id, content });
}

export function checklistToggle(id: string): Promise<ChecklistItem> {
  if (isMock) return mock.mockChecklistToggle(id);
  return invoke<ChecklistItem>('checklist_toggle', { id });
}

export function checklistReorder(
  id: string,
  beforeId?: string,
  afterId?: string,
): Promise<ChecklistItem> {
  if (isMock) return mock.mockChecklistReorder(id, beforeId, afterId);
  return invoke<ChecklistItem>('checklist_reorder', {
    id,
    beforeId: beforeId ?? null,
    afterId: afterId ?? null,
  });
}

export function checklistDelete(id: string): Promise<void> {
  if (isMock) return mock.mockChecklistDelete(id);
  return invoke<void>('checklist_delete', { id });
}

export function tagList(): Promise<Tag[]> {
  if (isMock) return mock.mockTagList();
  return invoke<Tag[]>('tag_list');
}

export function tagCreate(input: TagCreate): Promise<Tag> {
  if (isMock) return mock.mockTagCreate(input);
  return invoke<Tag>('tag_create', { input });
}

export function tagUpdate(id: string, patch: TagPatch): Promise<Tag> {
  if (isMock) return mock.mockTagUpdate(id, patch);
  return invoke<Tag>('tag_update', { id, patch });
}

export function tagDelete(id: string): Promise<void> {
  if (isMock) return mock.mockTagDelete(id);
  return invoke<void>('tag_delete', { id });
}

export function taskSetTags(taskId: string, tagIds: string[]): Promise<Task> {
  if (isMock) return mock.mockTaskSetTags(taskId, tagIds);
  return invoke<Task>('task_set_tags', { taskId, tagIds });
}

export function search(query: string, kinds?: SearchKind[], limit?: number): Promise<SearchHit[]> {
  if (isMock) return mock.mockSearch(query, kinds, limit);
  return invoke<SearchHit[]>('search', { query, kinds: kinds ?? null, limit: limit ?? null });
}

// ---- v0.3: projects, dashboard (hợp đồng B3 mục 2.1) ----

export function projectList(archived?: boolean): Promise<Project[]> {
  if (isMock) return mock.mockProjectList(archived);
  return invoke<Project[]>('project_list', { archived: archived ?? null });
}

export function projectGetOverview(id: string): Promise<ProjectOverview> {
  if (isMock) return mock.mockProjectGetOverview(id);
  return invoke<ProjectOverview>('project_get_overview', { id });
}

export function projectCreate(input: ProjectCreate): Promise<Project> {
  if (isMock) return mock.mockProjectCreate(input);
  return invoke<Project>('project_create', { input });
}

export function projectUpdate(
  id: string,
  patch: ProjectPatch,
  baseVersion: number,
): Promise<Project> {
  if (isMock) return mock.mockProjectUpdate(id, patch, baseVersion);
  return invoke<Project>('project_update', { id, patch, baseVersion });
}

export function projectReorder(id: string, beforeId?: string, afterId?: string): Promise<Project> {
  if (isMock) return mock.mockProjectReorder(id, beforeId, afterId);
  return invoke<Project>('project_reorder', {
    id,
    beforeId: beforeId ?? null,
    afterId: afterId ?? null,
  });
}

export function projectArchive(id: string, mode: ChildMode): Promise<void> {
  if (isMock) return mock.mockProjectArchive(id, mode);
  return invoke<void>('project_archive', { id, mode });
}

export function projectUnarchive(id: string): Promise<void> {
  if (isMock) return mock.mockProjectUnarchive(id);
  return invoke<void>('project_unarchive', { id });
}

export function projectDelete(id: string, mode: ChildMode): Promise<void> {
  if (isMock) return mock.mockProjectDelete(id, mode);
  return invoke<void>('project_delete', { id, mode });
}

export function dashboardToday(): Promise<TodayView> {
  if (isMock) return mock.mockDashboardToday();
  return invoke<TodayView>('dashboard_today');
}

/** Chỉ có ở bản debug. Đã có dữ liệu mẫu → `CONFLICT`. */
export function seedDemoData(): Promise<void> {
  if (isMock) return mock.mockSeedDemoData();
  return invoke<void>('seed_demo_data');
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
