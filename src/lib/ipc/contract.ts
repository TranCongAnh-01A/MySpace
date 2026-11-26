// Kiểu IPC v0.1: lấy thẳng từ bindings do ts-rs sinh ra (nguồn chuẩn là core Rust).
export type { Theme } from './bindings/Theme';
export type { Language } from './bindings/Language';
export type { WeekStart } from './bindings/WeekStart';
export type { DateFormat } from './bindings/DateFormat';
export type { AppSettings } from './bindings/AppSettings';
export type { SettingsPatch } from './bindings/SettingsPatch';
export type { Area } from './bindings/Area';
export type { AreaCreate } from './bindings/AreaCreate';
export type { AreaPatch } from './bindings/AreaPatch';
export type { BackupReason } from './bindings/BackupReason';
export type { Backup } from './bindings/Backup';
export type { AppInfo } from './bindings/AppInfo';

// v0.2 tạm — thay bằng bindings khi merge (chép đúng hợp đồng B2 mục 2.1)
export type TaskStatus = 'Todo' | 'InProgress' | 'Review' | 'Done';
export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
export type Weekday = 'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su';
export type Frequency = 'Daily' | 'Weekly' | 'Monthly';
export type Recurrence = { frequency: Frequency; interval: number; byWeekday?: Weekday[] };
export type Task = {
  id: string;
  projectId?: string;
  areaId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  startDate?: string;
  dueDate?: string;
  dueAt?: string;
  estimatedMinutes?: number;
  completedAt?: string;
  sortKey: string;
  recurrence?: Recurrence;
  tagIds: string[];
  checklistDone: number;
  checklistTotal: number;
  archivedAt?: string;
  deletedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type ChecklistItem = {
  id: string;
  taskId: string;
  content: string;
  isDone: boolean;
  sortKey: string;
};
export type TaskDetail = { task: Task; checklist: ChecklistItem[]; noteIds: string[] };
export type TaskCreate = {
  title: string;
  description?: string;
  projectId?: string;
  areaId?: string;
  status?: TaskStatus;
  priority?: Priority;
  startDate?: string;
  dueDate?: string;
  dueAt?: string;
  estimatedMinutes?: number;
  tagIds?: string[];
  recurrence?: Recurrence;
};
/** Thiếu = giữ nguyên, `null` = xoá, có giá trị = đặt. */
export type TaskPatch = {
  title?: string;
  description?: string;
  priority?: Priority;
  projectId?: string | null;
  areaId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  recurrence?: Recurrence | null;
};
export type DueFilter = 'Today' | 'Overdue' | 'Next7' | 'None';
export type TaskSort = 'Manual' | 'DueDate' | 'Priority' | 'Created';
export type TaskFilter = {
  status?: TaskStatus[];
  priority?: Priority[];
  projectId?: string;
  areaId?: string;
  tagId?: string;
  due?: DueFilter;
  archived?: boolean;
  sort?: TaskSort;
};
export type TaskStatusResult = { task: Task; next?: Task };
export type Tag = { id: string; name: string; color?: string };
export type TagCreate = { name: string; color?: string };
export type TagPatch = { name?: string; color?: string };
export type TrashKind = 'Task' | 'Inbox';
export type TrashItem = {
  kind: TrashKind;
  id: string;
  title: string;
  deletedAt: string;
  purgeAt: string;
};
export type SearchKind = 'Task' | 'Project' | 'Note' | 'Inbox';
export type SearchHit = { kind: SearchKind; id: string; title: string; snippet: string };
