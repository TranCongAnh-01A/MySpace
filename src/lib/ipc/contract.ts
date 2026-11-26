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

// v0.2
export type { TaskStatus } from './bindings/TaskStatus';
export type { Priority } from './bindings/Priority';
export type { Weekday } from './bindings/Weekday';
export type { Frequency } from './bindings/Frequency';
export type { Recurrence } from './bindings/Recurrence';
export type { Task } from './bindings/Task';
export type { ChecklistItem } from './bindings/ChecklistItem';
export type { TaskDetail } from './bindings/TaskDetail';
export type { TaskCreate } from './bindings/TaskCreate';
export type { TaskPatch } from './bindings/TaskPatch';
export type { DueFilter } from './bindings/DueFilter';
export type { TaskSort } from './bindings/TaskSort';
export type { TaskFilter } from './bindings/TaskFilter';
export type { TaskStatusResult } from './bindings/TaskStatusResult';
export type { Tag } from './bindings/Tag';
export type { TagCreate } from './bindings/TagCreate';
export type { TagPatch } from './bindings/TagPatch';
export type { SearchKind } from './bindings/SearchKind';
export type { SearchHit } from './bindings/SearchHit';

// v0.3 tạm — thay bằng bindings khi merge (hợp đồng B3 mục 2.1)
export type TrashKind = 'Task' | 'Inbox' | 'Project';
export type TrashItem = {
  kind: TrashKind;
  id: string;
  title: string;
  deletedAt: string;
  /** Thời điểm mục bị xoá hẳn: `deletedAt` + `trashRetentionDays`. */
  purgeAt: string;
};
export type ProjectStatus = 'Planned' | 'Active' | 'OnHold' | 'Completed';
export type Project = {
  id: string;
  areaId?: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color?: string;
  icon?: string;
  startDate?: string;
  targetDate?: string;
  sortKey: string;
  archivedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type ProjectCreate = {
  name: string;
  description?: string;
  areaId?: string;
  status?: ProjectStatus;
  color?: string;
  icon?: string;
  startDate?: string;
  targetDate?: string;
};
export type ProjectPatch = {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  areaId?: string | null;
  color?: string | null;
  icon?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
};
export type ChildMode = 'WithChildren' | 'Detach';
/** `percent` làm tròn 0–100; không có khi `total` = 0. */
export type ProjectProgress = {
  projectId: string;
  name: string;
  color?: string;
  done: number;
  total: number;
  percent?: number;
};
export type StatusCounts = { todo: number; inProgress: number; review: number; done: number };
export type NoteSummary = { id: string; title: string; projectId?: string; updatedAt: string };
export type ProjectOverview = {
  project: Project;
  progress: ProjectProgress;
  counts: StatusCounts;
  recentNotes: NoteSummary[];
};
import type { Task } from './bindings/Task';
export type TodayView = {
  /** Ngày địa phương YYYY-MM-DD theo Settings. */
  date: string;
  today: Task[];
  overdue: Task[];
  upcoming: Task[];
  activeProjects: ProjectProgress[];
  recentNotes: NoteSummary[];
};
