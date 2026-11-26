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
export type { TrashKind } from './bindings/TrashKind';
export type { TrashItem } from './bindings/TrashItem';
export type { ProjectStatus } from './bindings/ProjectStatus';
export type { Project } from './bindings/Project';
export type { ProjectCreate } from './bindings/ProjectCreate';
export type { ProjectPatch } from './bindings/ProjectPatch';
export type { ChildMode } from './bindings/ChildMode';
export type { ProjectProgress } from './bindings/ProjectProgress';
export type { StatusCounts } from './bindings/StatusCounts';
export type { NoteSummary } from './bindings/NoteSummary';
export type { ProjectOverview } from './bindings/ProjectOverview';

// v0.4 tạm — thay bằng bindings khi merge (chép đúng hợp đồng B4 mục 2.1)
import type { ChecklistItem } from './bindings/ChecklistItem';
import type { NoteSummary } from './bindings/NoteSummary';
import type { ProjectProgress } from './bindings/ProjectProgress';
import type { Task } from './bindings/Task';

export type Calendar = { id: string; name: string; color?: string; isDefault: boolean };
export type Event = {
  id: string;
  calendarId: string;
  taskId?: string;
  title: string;
  description: string;
  isAllDay: boolean;
  startAt?: string;
  endAt?: string;
  startDate?: string;
  endDate?: string; // inclusive
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type EventCreate = {
  calendarId?: string;
  title: string;
  description?: string;
  isAllDay: boolean;
  startAt?: string;
  endAt?: string;
  startDate?: string;
  endDate?: string;
  taskId?: string;
};
export type EventPatch = {
  title?: string;
  description?: string;
  calendarId?: string;
  isAllDay?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};
export type CalendarItem = { kind: 'Event'; event: Event } | { kind: 'Deadline'; task: Task };
export type ReminderStatus = 'Pending' | 'Sent' | 'Dismissed' | 'Missed';
export type Reminder = {
  id: string;
  taskId?: string;
  eventId?: string;
  triggerAt: string;
  offsetMinutes?: number;
  status: ReminderStatus;
  sentAt?: string;
};
export type ReminderSet = {
  taskId?: string;
  eventId?: string;
  offsetMinutes?: number;
  triggerAt?: string;
};
export type MissedReminder = { reminder: Reminder; title: string; dueLabelAt: string };
export type TaskDetail = {
  task: Task;
  checklist: ChecklistItem[];
  noteIds: string[];
  reminders: Reminder[];
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
export type ReminderFired = { reminderId: string; taskId?: string; eventId?: string };
export type Navigate = { route: string };
