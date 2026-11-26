import type { CalendarItem } from './bindings/CalendarItem';
import type { Project } from './bindings/Project';
import type { ProjectProgress } from './bindings/ProjectProgress';
import type { StatusCounts } from './bindings/StatusCounts';
import type { Task } from './bindings/Task';

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

// v0.3
export type { ProjectStatus } from './bindings/ProjectStatus';
export type { Project } from './bindings/Project';
export type { ProjectCreate } from './bindings/ProjectCreate';
export type { ProjectPatch } from './bindings/ProjectPatch';
export type { ChildMode } from './bindings/ChildMode';
export type { ProjectProgress } from './bindings/ProjectProgress';
export type { StatusCounts } from './bindings/StatusCounts';

// v0.4
export type { Calendar } from './bindings/Calendar';
export type { Event } from './bindings/Event';
export type { EventCreate } from './bindings/EventCreate';
export type { EventPatch } from './bindings/EventPatch';
export type { CalendarItem } from './bindings/CalendarItem';
export type { ReminderStatus } from './bindings/ReminderStatus';
export type { Reminder } from './bindings/Reminder';
export type { ReminderSet } from './bindings/ReminderSet';
export type { MissedReminder } from './bindings/MissedReminder';
export type { TaskDetail } from './bindings/TaskDetail';
export type { ReminderFired } from './bindings/ReminderFired';
export type { Navigate } from './bindings/Navigate';

// v0.5 tạm — thay bằng bindings khi merge (hợp đồng B5 mục 2.1)
export type TrashKind = 'Task' | 'Inbox' | 'Project' | 'Note';
export type TrashItem = {
  kind: TrashKind;
  id: string;
  title: string;
  deletedAt: string;
  purgeAt: string;
};
export type NoteSummary = {
  id: string;
  title: string;
  projectId?: string;
  updatedAt: string;
  /** ≤160 ký tự đầu của search_text. */
  excerpt: string;
};
export type ProjectOverview = {
  project: Project;
  progress: ProjectProgress;
  counts: StatusCounts;
  recentNotes: NoteSummary[];
};
export type TodayView = {
  date: string;
  today: Task[];
  overdue: Task[];
  upcoming: Task[];
  activeProjects: ProjectProgress[];
  recentNotes: NoteSummary[];
  schedule: CalendarItem[];
};
/** `contentJson` là chuỗi JSON của Tiptap (`JSON.stringify(editor.getJSON())`). */
export type Note = {
  id: string;
  projectId?: string;
  parentNoteId?: string;
  title: string;
  contentJson: string;
  version: number;
  taskIds: string[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
export type NoteCreate = {
  title?: string;
  contentJson?: string;
  projectId?: string;
  parentNoteId?: string;
  taskId?: string;
  tagIds?: string[];
};
export type NoteSort = 'Updated' | 'Title' | 'Created';
export type NoteFilter = {
  projectId?: string;
  taskId?: string;
  tagId?: string;
  trashed?: boolean;
  sort?: NoteSort;
};
export type NoteSaveResult = { version: number; updatedAt: string };
