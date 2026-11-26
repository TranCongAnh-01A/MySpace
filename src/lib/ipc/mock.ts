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
  ChecklistItem,
  ChildMode,
  Priority,
  Project,
  ProjectCreate,
  ProjectOverview,
  ProjectPatch,
  ProjectProgress,
  Recurrence,
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
  Weekday,
} from './contract';
import { addDays, localToUtc, todayIn, utcToLocalParts, weekdayOf } from '@/lib/tz';

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
  saveState();
  listeners.forEach((l) => l({ entity, ids }));
}

// ---- inbox ----
type InboxRec = InboxItem & { deletedAt?: string };
const inbox: InboxRec[] = [
  {
    id: 'mock-inbox-3',
    content: 'Đặt lịch họp khách hàng GGStudio, xem https://example.com/brief',
    status: 'Open',
    createdAt: '2026-11-26T03:30:00.000Z',
  },
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
  {
    id: 'mock-inbox-0',
    content: 'Viết báo cáo tuần',
    status: 'Processed',
    convertedTaskId: 'mock-task-1',
    processedAt: '2026-11-25T09:00:00.000Z',
    createdAt: '2026-11-24T08:00:00.000Z',
  },
];
const liveInbox = (id: string): InboxRec => {
  const rec = inbox.find((i) => i.id === id && !i.deletedAt);
  return rec ?? fail('NOT_FOUND', 'Không tìm thấy mục Inbox');
};
const pubInbox = (i: InboxRec): InboxItem => {
  const { deletedAt: _d, ...rest } = i;
  void _d;
  return { ...rest };
};

export function mockInboxList(status?: InboxStatus): Promise<InboxItem[]> {
  return delay(() =>
    inbox
      .filter((i) => !i.deletedAt && (!status || i.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(pubInbox),
  );
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
    inbox.unshift(item);
    emit('inbox', [item.id]);
    return item;
  });
}

export function mockInboxUpdate(id: string, content: string): Promise<InboxItem> {
  return delay(() => {
    const rec = liveInbox(id);
    const text = content.trim();
    if (!text) fail('VALIDATION', 'Nội dung không được để trống');
    if (rec.status === 'Processed') fail('CONFLICT', 'Mục này đã được xử lý');
    rec.content = text;
    emit('inbox', [id]);
    return pubInbox(rec);
  });
}

export function mockInboxDelete(id: string): Promise<void> {
  return delay(() => {
    liveInbox(id).deletedAt = new Date().toISOString();
    emit('inbox', [id]);
  });
}

export function mockInboxConvertToTask(id: string, input: TaskCreate): Promise<Task> {
  return delay(() => {
    const rec = liveInbox(id);
    if (rec.status === 'Processed') fail('CONFLICT', 'Mục này đã được xử lý');
    const task = createTaskInternal(input);
    rec.status = 'Processed';
    rec.convertedTaskId = task.id;
    rec.processedAt = new Date().toISOString();
    emit('inbox', [id]);
    emit('task', [task.id]);
    return viewTask(task);
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

// ================= v0.2: tasks, checklist, tags, trash, search =================
const nowIso = () => new Date().toISOString();
const tzName = () => settings.timezone;
const todayStr = () => todayIn(tzName());
const dayOf = (t: Task): string | undefined =>
  t.dueDate ?? (t.dueAt ? utcToLocalParts(t.dueAt, tzName()).date : undefined);

let tags: Tag[] = [
  { id: 'mock-tag-1', name: 'khách hàng', color: '#5B9BD5' },
  { id: 'mock-tag-2', name: 'gấp', color: '#E57373' },
  { id: 'mock-tag-3', name: 'ở nhà', color: '#63BB91' },
];
let tasks: Task[] = [];
let checklists: ChecklistItem[] = [];
const previousStatus = new Map<string, TaskStatus>();
let keyCounter = 1000;
const nextKey = () => (keyCounter += 1);
const padKey = (n: number) => n.toFixed(6).padStart(16, '0');

function rawTask(over: Partial<Task> & { title: string }): Task {
  const now = nowIso();
  return {
    id: crypto.randomUUID(),
    description: '',
    status: 'Todo',
    priority: 'Medium',
    sortKey: padKey(nextKey()),
    tagIds: [],
    checklistDone: 0,
    checklistTotal: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function seedTasks() {
  const t = todayStr();
  const mk = (over: Partial<Task> & { title: string }) => tasks.push(rawTask(over));
  mk({
    id: 'mock-task-1',
    title: 'Viết báo cáo tuần',
    status: 'InProgress',
    priority: 'High',
    dueDate: t,
    tagIds: ['mock-tag-1'],
    areaId: 'mock-area-1',
    description: 'Tổng hợp công việc tuần này gửi cho thầy.',
  });
  mk({
    title: 'Nộp hồ sơ học bổng',
    priority: 'Urgent',
    dueDate: addDays(t, -2),
    tagIds: ['mock-tag-2'],
  });
  mk({
    title: 'Họp với khách GGStudio',
    priority: 'Medium',
    dueAt: localToUtc(addDays(t, 1), '09:30', tzName()),
    tagIds: ['mock-tag-1'],
  });
  mk({
    title: 'Tập thể dục',
    priority: 'Low',
    dueDate: t,
    recurrence: { frequency: 'Daily', interval: 1 },
    areaId: 'mock-area-3',
  });
  mk({ title: 'Đọc sách kỹ thuật', status: 'Review', priority: 'Low', dueDate: addDays(t, 4) });
  mk({ title: 'Dọn bàn làm việc', status: 'Done', completedAt: nowIso(), tagIds: ['mock-tag-3'] });
  mk({ title: 'Lập kế hoạch tháng sau', priority: 'Medium' });
  const first = tasks[0];
  if (first) {
    checklists.push(
      {
        id: 'mock-cl-1',
        taskId: first.id,
        content: 'Thu thập số liệu',
        isDone: true,
        sortKey: padKey(1),
      },
      {
        id: 'mock-cl-2',
        taskId: first.id,
        content: 'Viết bản nháp',
        isDone: false,
        sortKey: padKey(2),
      },
      {
        id: 'mock-cl-3',
        taskId: first.id,
        content: 'Gửi cho thầy',
        isDone: false,
        sortKey: padKey(3),
      },
    );
  }
  const n = Number(import.meta.env.VITE_MOCK_SEED ?? 0);
  if (n > 0) {
    const statuses: TaskStatus[] = ['Todo', 'InProgress', 'Review', 'Done'];
    const prios: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
    for (let i = 0; i < n; i++) {
      const hasDue = i % 3 !== 0;
      mk({
        title: `Công việc giả số ${i + 1}`,
        status: statuses[i % 4] ?? 'Todo',
        priority: prios[i % 4] ?? 'Medium',
        ...(hasDue ? { dueDate: addDays(t, (i % 21) - 7) } : {}),
        tagIds: i % 5 === 0 ? ['mock-tag-1'] : [],
      });
    }
  }
}
let seeded = false;
function ensureSeed() {
  if (!seeded) {
    seeded = true;
    seedTasks();
  }
}

function viewTask(t: Task): Task {
  const items = checklists.filter((c) => c.taskId === t.id);
  const copy: Task = {
    ...t,
    tagIds: [...t.tagIds],
    checklistTotal: items.length,
    checklistDone: items.filter((c) => c.isDone).length,
  };
  if (t.recurrence) copy.recurrence = { ...t.recurrence };
  return copy;
}
const liveTask = (id: string): Task => {
  ensureSeed();
  return tasks.find((t) => t.id === id && !t.deletedAt) ?? fail('NOT_FOUND', 'Không tìm thấy Task');
};
const touch = (t: Task) => {
  t.version += 1;
  t.updatedAt = nowIso();
};

function validateTask(t: {
  title: string;
  description?: string | undefined;
  dueDate?: string | undefined;
  dueAt?: string | undefined;
  startDate?: string | undefined;
  estimatedMinutes?: number | undefined;
  projectId?: string | undefined;
  areaId?: string | undefined;
  recurrence?: Recurrence | undefined;
}) {
  if (!t.title.trim()) fail('VALIDATION', 'Tiêu đề không được để trống');
  if (t.title.length > 500) fail('VALIDATION', 'Tiêu đề tối đa 500 ký tự');
  if ((t.description?.length ?? 0) > 20000) fail('VALIDATION', 'Mô tả tối đa 20.000 ký tự');
  if (t.estimatedMinutes !== undefined && (t.estimatedMinutes < 1 || t.estimatedMinutes > 10080))
    fail('VALIDATION', 'Thời lượng dự kiến từ 1 đến 10.080 phút');
  if (t.dueDate && t.dueAt) fail('VALIDATION', 'Chỉ chọn hạn theo ngày hoặc theo giờ');
  if (t.projectId && t.areaId) fail('VALIDATION', 'Task thuộc Project thì không chọn lĩnh vực');
  if (t.projectId) {
    const p = projects.find((x) => x.id === t.projectId && !x.deletedAt);
    if (!p || p.archivedAt) fail('VALIDATION', 'Project không tồn tại hoặc đã lưu trữ');
  }
  if (t.recurrence && !t.dueDate && !t.dueAt) fail('VALIDATION', 'Task lặp cần có hạn');
  const due = t.dueDate ?? (t.dueAt ? utcToLocalParts(t.dueAt, tzName()).date : undefined);
  if (t.startDate && due && t.startDate > due) fail('VALIDATION', 'Ngày bắt đầu phải trước hạn');
}

function createTaskInternal(input: TaskCreate): Task {
  ensureSeed();
  validateTask(input);
  const { tagIds, ...rest } = input;
  const task = rawTask({ ...rest, title: input.title.trim(), tagIds: tagIds ? [...tagIds] : [] });
  tasks.push(task);
  return task;
}

const WEEKDAY_INDEX: Record<Weekday, number> = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
const monIdx = (date: string) => (weekdayOf(date) + 6) % 7;

function addMonths(date: string, months: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Ngày của lần lặp tiếp theo (quy tắc B2 mục 2.2). */
export function nextOccurrence(date: string, rec: Recurrence): string {
  if (rec.frequency === 'Daily') return addDays(date, rec.interval);
  if (rec.frequency === 'Monthly') return addMonths(date, rec.interval);
  const days = (rec.byWeekday ?? []).map((w) => WEEKDAY_INDEX[w]).sort((a, b) => a - b);
  if (days.length === 0) return addDays(date, 7 * rec.interval);
  const cur = monIdx(date);
  const later = days.find((d) => d > cur);
  if (later !== undefined) return addDays(date, later - cur);
  return addDays(date, 7 * rec.interval - cur + (days[0] ?? 0));
}

function applyStatus(t: Task, status: TaskStatus): TaskStatusResult {
  let next: Task | undefined;
  if (status === 'Done' && t.status !== 'Done') {
    previousStatus.set(t.id, t.status);
    t.completedAt = nowIso();
    if (t.recurrence && (t.dueDate || t.dueAt)) {
      const base = dayOf(t) ?? todayStr();
      const nd = nextOccurrence(base, t.recurrence);
      const time = t.dueAt ? utcToLocalParts(t.dueAt, tzName()).time : undefined;
      const created = rawTask({
        title: t.title,
        description: t.description,
        priority: t.priority,
        tagIds: [...t.tagIds],
        recurrence: { ...t.recurrence },
        ...(t.areaId ? { areaId: t.areaId } : {}),
        ...(t.projectId ? { projectId: t.projectId } : {}),
        ...(t.estimatedMinutes ? { estimatedMinutes: t.estimatedMinutes } : {}),
        ...(time ? { dueAt: localToUtc(nd, time, tzName()) } : { dueDate: nd }),
      });
      tasks.push(created);
      checklists
        .filter((c) => c.taskId === t.id)
        .forEach((c) =>
          checklists.push({ ...c, id: crypto.randomUUID(), taskId: created.id, isDone: false }),
        );
      next = created;
    }
  } else if (status !== 'Done' && t.status === 'Done') {
    delete t.completedAt;
  }
  t.status = status;
  touch(t);
  return { task: viewTask(t), ...(next ? { next: viewTask(next) } : {}) };
}

const PRIORITY_RANK: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
function dueKey(t: Task): string {
  const d = dayOf(t);
  if (!d) return '9999-99-99';
  return `${d}${t.dueAt ? '0' : '1'}${t.dueAt ?? ''}`;
}

export function mockTaskList(filter: TaskFilter = {}): Promise<Task[]> {
  return delay(() => {
    ensureSeed();
    const today = todayStr();
    const now = nowIso();
    let list = tasks.filter(
      (t) => !t.deletedAt && (filter.archived ? !!t.archivedAt : !t.archivedAt),
    );
    if (filter.status?.length) list = list.filter((t) => filter.status?.includes(t.status));
    if (filter.priority?.length) list = list.filter((t) => filter.priority?.includes(t.priority));
    if (filter.areaId) list = list.filter((t) => t.areaId === filter.areaId);
    if (filter.projectId) list = list.filter((t) => t.projectId === filter.projectId);
    if (filter.tagId) list = list.filter((t) => filter.tagId && t.tagIds.includes(filter.tagId));
    if (filter.due) {
      list = list.filter((t) => {
        const d = dayOf(t);
        switch (filter.due) {
          case 'Today':
            return d === today;
          case 'Overdue':
            return (
              t.status !== 'Done' &&
              ((!!t.dueDate && t.dueDate < today) || (!!t.dueAt && t.dueAt < now))
            );
          case 'Next7':
            return !!d && d > today && d <= addDays(today, 7);
          case 'None':
            return !d;
          default:
            return true;
        }
      });
    }
    const sort = filter.sort ?? 'Manual';
    list = [...list].sort((a, b) => {
      if (sort === 'DueDate') return dueKey(a).localeCompare(dueKey(b));
      if (sort === 'Priority')
        return (
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          dueKey(a).localeCompare(dueKey(b))
        );
      if (sort === 'Created') return b.createdAt.localeCompare(a.createdAt);
      return a.sortKey.localeCompare(b.sortKey);
    });
    return list.map(viewTask);
  });
}

export function mockTaskGet(id: string): Promise<TaskDetail> {
  return delay(() => {
    const t = liveTask(id);
    return {
      task: viewTask(t),
      checklist: checklists
        .filter((c) => c.taskId === id)
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map((c) => ({ ...c })),
      noteIds: [],
    };
  });
}

export function mockTaskCreate(input: TaskCreate): Promise<Task> {
  return delay(() => {
    const t = createTaskInternal(input);
    emit('task', [t.id]);
    return viewTask(t);
  });
}

export function mockTaskUpdate(id: string, patch: TaskPatch, baseVersion: number): Promise<Task> {
  return delay(() => {
    const t = liveTask(id);
    if (t.version !== baseVersion) fail('CONFLICT', 'Task vừa được sửa ở nơi khác');
    const next: Task = { ...t };
    const setOrDel = <
      K extends
        | 'projectId'
        | 'areaId'
        | 'startDate'
        | 'dueDate'
        | 'dueAt'
        | 'estimatedMinutes'
        | 'recurrence',
    >(
      key: K,
    ) => {
      const v = patch[key];
      if (v === undefined) return;
      if (v === null) delete next[key];
      else (next as Record<string, unknown>)[key] = v;
    };
    if (patch.title !== undefined) next.title = patch.title.trim();
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.priority !== undefined) next.priority = patch.priority;
    (
      [
        'projectId',
        'areaId',
        'startDate',
        'dueDate',
        'dueAt',
        'estimatedMinutes',
        'recurrence',
      ] as const
    ).forEach(setOrDel);
    validateTask(next);
    Object.assign(t, next);
    touch(t);
    emit('task', [id]);
    return viewTask(t);
  });
}

export function mockTaskSetStatus(id: string, status: TaskStatus): Promise<TaskStatusResult> {
  return delay(() => {
    const t = liveTask(id);
    const result = applyStatus(t, status);
    emit('task', result.next ? [id, result.next.id] : [id]);
    return result;
  });
}

export function mockTaskMove(
  id: string,
  status: TaskStatus,
  beforeId?: string,
  afterId?: string,
): Promise<TaskStatusResult> {
  return delay(() => {
    const t = liveTask(id);
    const result = t.status !== status ? applyStatus(t, status) : { task: viewTask(t) };
    const key = (x?: string) => {
      const o = x ? tasks.find((q) => q.id === x) : undefined;
      return o ? Number(o.sortKey) : undefined;
    };
    const b = key(beforeId);
    const a = key(afterId);
    let k: number;
    if (b !== undefined && a !== undefined) k = (b + a) / 2;
    else if (b !== undefined) k = b + 0.5;
    else if (a !== undefined) k = a - 0.5;
    else k = nextKey();
    t.sortKey = padKey(k);
    touch(t);
    emit('task', [id]);
    return { ...result, task: viewTask(t) };
  });
}

export function mockTaskArchive(id: string, archived: boolean): Promise<void> {
  return delay(() => {
    ensureSeed();
    const t =
      tasks.find((x) => x.id === id && !x.deletedAt) ?? fail('NOT_FOUND', 'Không tìm thấy Task');
    if (archived) t.archivedAt = nowIso();
    else delete t.archivedAt;
    touch(t);
    emit('task', [id]);
  });
}

export function mockTaskDelete(id: string): Promise<void> {
  return delay(() => {
    liveTask(id).deletedAt = nowIso();
    emit('task', [id]);
  });
}

// ---- trash ----
export function mockTrashList(): Promise<TrashItem[]> {
  return delay(() => {
    ensureSeed();
    const days = settings.trashRetentionDays;
    const purge = (iso: string) =>
      new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
    const items: TrashItem[] = [
      ...tasks
        .filter((t) => t.deletedAt && !deletedWithProject(t))
        .map((t): TrashItem => ({
          kind: 'Task',
          id: t.id,
          title: t.title,
          deletedAt: t.deletedAt ?? '',
          purgeAt: purge(t.deletedAt ?? ''),
        })),
      ...projects
        .filter((p) => p.deletedAt)
        .map((p): TrashItem => ({
          kind: 'Project',
          id: p.id,
          title: p.name,
          deletedAt: p.deletedAt ?? '',
          purgeAt: purge(p.deletedAt ?? ''),
        })),
      ...inbox
        .filter((i) => i.deletedAt)
        .map((i): TrashItem => ({
          kind: 'Inbox',
          id: i.id,
          title: i.content,
          deletedAt: i.deletedAt ?? '',
          purgeAt: purge(i.deletedAt ?? ''),
        })),
    ];
    return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  });
}

/** Task bị xoá cùng lúc (cùng mốc) với Project của nó thì không hiện riêng trong Trash. */
const deletedWithProject = (t: Task) =>
  !!t.projectId && projects.some((p) => p.id === t.projectId && p.deletedAt === t.deletedAt);

export function mockTrashRestore(kind: TrashKind, id: string): Promise<void> {
  return delay(() => {
    ensureSeed();
    if (kind === 'Project') {
      const p = projects.find((x) => x.id === id);
      if (!p?.deletedAt) return fail('NOT_FOUND', 'Không tìm thấy trong Thùng rác');
      const stamp = p.deletedAt;
      tasks.forEach((t) => {
        if (t.projectId === id && t.deletedAt === stamp) delete t.deletedAt;
      });
      delete p.deletedAt;
      emit('project', [id]);
      emit('task');
      return;
    }
    const rec = kind === 'Task' ? tasks.find((t) => t.id === id) : inbox.find((i) => i.id === id);
    if (!rec?.deletedAt) fail('NOT_FOUND', 'Không tìm thấy trong Thùng rác');
    delete rec?.deletedAt;
    emit(kind === 'Task' ? 'task' : 'inbox', [id]);
  });
}

export function mockTrashEmpty(): Promise<void> {
  return delay(() => {
    ensureSeed();
    const gone = new Set(projects.filter((p) => p.deletedAt).map((p) => p.id));
    tasks = tasks.filter((t) => !t.deletedAt && !(t.projectId && gone.has(t.projectId)));
    projects = projects.filter((p) => !p.deletedAt);
    for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i]?.deletedAt) inbox.splice(i, 1);
    emit('task');
    emit('project');
    emit('inbox');
  });
}

// ---- checklist ----
const findCl = (id: string): ChecklistItem =>
  checklists.find((c) => c.id === id) ?? fail('NOT_FOUND', 'Không tìm thấy mục checklist');
const clContent = (s: string) => {
  const c = s.trim();
  if (!c) fail('VALIDATION', 'Nội dung không được để trống');
  if (c.length > 500) fail('VALIDATION', 'Nội dung tối đa 500 ký tự');
  return c;
};

export function mockChecklistAdd(taskId: string, content: string): Promise<ChecklistItem> {
  return delay(() => {
    liveTask(taskId);
    const item: ChecklistItem = {
      id: crypto.randomUUID(),
      taskId,
      content: clContent(content),
      isDone: false,
      sortKey: padKey(nextKey()),
    };
    checklists.push(item);
    emit('task', [taskId]);
    return { ...item };
  });
}
export function mockChecklistUpdate(id: string, content: string): Promise<ChecklistItem> {
  return delay(() => {
    const c = findCl(id);
    c.content = clContent(content);
    emit('task', [c.taskId]);
    return { ...c };
  });
}
export function mockChecklistToggle(id: string): Promise<ChecklistItem> {
  return delay(() => {
    const c = findCl(id);
    c.isDone = !c.isDone;
    emit('task', [c.taskId]);
    return { ...c };
  });
}
export function mockChecklistReorder(
  id: string,
  beforeId?: string,
  afterId?: string,
): Promise<ChecklistItem> {
  return delay(() => {
    const c = findCl(id);
    const key = (x?: string) => (x ? Number(findCl(x).sortKey) : undefined);
    const b = key(beforeId);
    const a = key(afterId);
    c.sortKey = padKey(
      b !== undefined && a !== undefined
        ? (b + a) / 2
        : b !== undefined
          ? b + 0.5
          : a !== undefined
            ? a - 0.5
            : nextKey(),
    );
    emit('task', [c.taskId]);
    return { ...c };
  });
}
export function mockChecklistDelete(id: string): Promise<void> {
  return delay(() => {
    const c = findCl(id);
    checklists = checklists.filter((x) => x.id !== id);
    emit('task', [c.taskId]);
  });
}

// ---- tags ----
const tagName = (s: string, exceptId?: string) => {
  const n = s.trim();
  if (!n) fail('VALIDATION', 'Tên tag không được để trống');
  if (n.length > 50) fail('VALIDATION', 'Tên tag tối đa 50 ký tự');
  if (tags.some((t) => t.id !== exceptId && t.name.toLowerCase() === n.toLowerCase()))
    fail('CONFLICT', 'Tag này đã có');
  return n;
};
export function mockTagList(): Promise<Tag[]> {
  return delay(() => [...tags].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ ...t })));
}
export function mockTagCreate(input: TagCreate): Promise<Tag> {
  return delay(() => {
    const tag: Tag = {
      id: crypto.randomUUID(),
      name: tagName(input.name),
      ...(input.color ? { color: input.color } : {}),
    };
    tags.push(tag);
    emit('tag', [tag.id]);
    return { ...tag };
  });
}
export function mockTagUpdate(id: string, patch: TagPatch): Promise<Tag> {
  return delay(() => {
    const tag = tags.find((t) => t.id === id) ?? fail('NOT_FOUND', 'Không tìm thấy tag');
    if (patch.name !== undefined) tag.name = tagName(patch.name, id);
    if (patch.color !== undefined) {
      if (patch.color === '') delete tag.color;
      else tag.color = patch.color;
    }
    emit('tag', [id]);
    return { ...tag };
  });
}
export function mockTagDelete(id: string): Promise<void> {
  return delay(() => {
    ensureSeed();
    tags = tags.filter((t) => t.id !== id);
    tasks.forEach((t) => (t.tagIds = t.tagIds.filter((x) => x !== id)));
    emit('tag', [id]);
    emit('task');
  });
}
export function mockTaskSetTags(taskId: string, tagIds: string[]): Promise<Task> {
  return delay(() => {
    const t = liveTask(taskId);
    t.tagIds = tagIds.filter((id) => tags.some((x) => x.id === id));
    touch(t);
    emit('task', [taskId]);
    return viewTask(t);
  });
}

// ---- search (không dấu) ----
export const foldText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function mockSearch(query: string, kinds?: SearchKind[], limit = 20): Promise<SearchHit[]> {
  return delay(() => {
    ensureSeed();
    const words = foldText(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const max = Math.min(Math.max(limit, 1), 100);
    const match = (text: string) => {
      const tokens = foldText(text)
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      return words.every((w) => tokens.some((tk) => tk.startsWith(w)));
    };
    const hits: SearchHit[] = [];
    if (!kinds || kinds.includes('Task'))
      tasks
        .filter((t) => !t.deletedAt && match(`${t.title} ${t.description}`))
        .forEach((t) =>
          hits.push({
            kind: 'Task',
            id: t.id,
            title: t.title,
            snippet: t.description.slice(0, 80) || t.title,
          }),
        );
    if (!kinds || kinds.includes('Project'))
      projects
        .filter((p) => !p.deletedAt && match(`${p.name} ${p.description}`))
        .forEach((p) =>
          hits.push({
            kind: 'Project',
            id: p.id,
            title: p.name,
            snippet: p.description.slice(0, 80) || p.name,
          }),
        );
    if (!kinds || kinds.includes('Inbox'))
      inbox
        .filter((i) => !i.deletedAt && i.status === 'Open' && match(i.content))
        .forEach((i) =>
          hits.push({
            kind: 'Inbox',
            id: i.id,
            title: i.content.split('\n')[0] ?? i.content,
            snippet: i.content.slice(0, 80),
          }),
        );
    return hits.slice(0, max);
  });
}

// ================= v0.3: projects, dashboard, dữ liệu mẫu, lưu localStorage =================
type ProjectRec = Project & { deletedAt?: string };
let projects: ProjectRec[] = [];
const pubProject = (p: ProjectRec): Project => {
  const { deletedAt: _d, ...rest } = p;
  void _d;
  return { ...rest };
};
const liveProject = (id: string): ProjectRec =>
  projects.find((p) => p.id === id && !p.deletedAt) ?? fail('NOT_FOUND', 'Không tìm thấy Project');
const resortProjects = () => {
  projects = projects.map((p, i) => ({ ...p, sortKey: String(i + 1).padStart(5, '0') }));
};
const sortedProjects = () => [...projects].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

function validateProject(p: {
  name: string;
  description?: string | undefined;
  color?: string | undefined;
  icon?: string | undefined;
  startDate?: string | undefined;
  targetDate?: string | undefined;
  areaId?: string | undefined;
}) {
  const name = p.name.trim();
  if (!name) fail('VALIDATION', 'Tên dự án không được để trống');
  if (name.length > 100) fail('VALIDATION', 'Tên dự án tối đa 100 ký tự');
  if ((p.description?.length ?? 0) > 20000) fail('VALIDATION', 'Mô tả tối đa 20.000 ký tự');
  if (p.color && !/^#[0-9A-Fa-f]{6}$/.test(p.color)) fail('VALIDATION', 'Màu phải dạng #RRGGBB');
  if (p.icon && !/^[a-z0-9-]{1,40}$/.test(p.icon)) fail('VALIDATION', 'Tên icon không hợp lệ');
  if (p.startDate && p.targetDate && p.targetDate < p.startDate)
    fail('VALIDATION', 'Ngày kết thúc không được trước ngày bắt đầu');
  if (p.areaId && !areas.some((a) => a.id === p.areaId))
    fail('VALIDATION', 'Lĩnh vực không tồn tại');
  return name;
}

const activeChildren = (id: string) =>
  tasks.filter((t) => t.projectId === id && !t.archivedAt && !t.deletedAt);

function progressOf(p: Project): ProjectProgress {
  const list = activeChildren(p.id);
  const done = list.filter((t) => t.status === 'Done').length;
  const total = list.length;
  return {
    projectId: p.id,
    name: p.name,
    ...(p.color ? { color: p.color } : {}),
    done,
    total,
    ...(total > 0 ? { percent: Math.round((done * 100) / total) } : {}),
  };
}

export function mockProjectList(archived?: boolean): Promise<Project[]> {
  return delay(() =>
    sortedProjects()
      .filter((p) => !p.deletedAt && (archived ? !!p.archivedAt : !p.archivedAt))
      .map(pubProject),
  );
}

export function mockProjectGetOverview(id: string): Promise<ProjectOverview> {
  return delay(() => {
    ensureSeed();
    const p = pubProject(liveProject(id));
    const list = activeChildren(id);
    const n = (s: TaskStatus) => list.filter((t) => t.status === s).length;
    return {
      project: p,
      progress: progressOf(p),
      counts: {
        todo: n('Todo'),
        inProgress: n('InProgress'),
        review: n('Review'),
        done: n('Done'),
      },
      recentNotes: [],
    };
  });
}

function createProjectInternal(input: ProjectCreate): ProjectRec {
  const name = validateProject(input);
  const now = nowIso();
  const rec: ProjectRec = {
    id: crypto.randomUUID(),
    name,
    description: input.description ?? '',
    status: input.status ?? 'Active',
    sortKey: '',
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(input.areaId ? { areaId: input.areaId } : {}),
    ...(input.color ? { color: input.color } : {}),
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
  };
  projects = [...projects, rec];
  resortProjects();
  return projects[projects.length - 1] ?? rec;
}

export function mockProjectCreate(input: ProjectCreate): Promise<Project> {
  return delay(() => {
    ensureSeed();
    const rec = createProjectInternal(input);
    emit('project', [rec.id]);
    return pubProject(rec);
  });
}

export function mockProjectUpdate(
  id: string,
  patch: ProjectPatch,
  baseVersion: number,
): Promise<Project> {
  return delay(() => {
    const p = liveProject(id);
    if (p.version !== baseVersion) fail('CONFLICT', 'Dự án vừa được sửa ở nơi khác');
    const next: ProjectRec = { ...p };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.status !== undefined) next.status = patch.status;
    (['areaId', 'color', 'icon', 'startDate', 'targetDate'] as const).forEach((k) => {
      const v = patch[k];
      if (v === undefined) return;
      if (v === null) delete next[k];
      else next[k] = v;
    });
    next.name = validateProject(next);
    Object.assign(p, next);
    p.version += 1;
    p.updatedAt = nowIso();
    emit('project', [id]);
    return pubProject(p);
  });
}

export function mockProjectReorder(
  id: string,
  beforeId?: string,
  afterId?: string,
): Promise<Project> {
  return delay(() => {
    const moving = liveProject(id);
    const rest = sortedProjects().filter((p) => p.id !== id);
    let index = rest.length;
    if (beforeId) index = rest.findIndex((p) => p.id === beforeId) + 1;
    else if (afterId) index = rest.findIndex((p) => p.id === afterId);
    rest.splice(Math.max(0, index), 0, moving);
    projects = rest;
    resortProjects();
    emit('project', [id]);
    return pubProject(liveProject(id));
  });
}

/** Gán `archivedAt`/`deletedAt` bằng cùng một mốc `now` cho Project và các Task con (B3 mục 2.2). */
function retire(id: string, mode: ChildMode, field: 'archivedAt' | 'deletedAt') {
  ensureSeed();
  const p = liveProject(id);
  const now = nowIso();
  if (mode === 'WithChildren') {
    tasks.forEach((t) => {
      if (t.projectId === id && !t.archivedAt && !t.deletedAt) t[field] = now;
    });
  } else {
    tasks.forEach((t) => {
      if (t.projectId !== id) return;
      delete t.projectId;
      if (!t.areaId && p.areaId) t.areaId = p.areaId;
    });
  }
  p[field] = now;
  p.version += 1;
  p.updatedAt = now;
  emit('project', [id]);
  emit('task');
}

export function mockProjectArchive(id: string, mode: ChildMode): Promise<void> {
  return delay(() => retire(id, mode, 'archivedAt'));
}

export function mockProjectDelete(id: string, mode: ChildMode): Promise<void> {
  return delay(() => retire(id, mode, 'deletedAt'));
}

export function mockProjectUnarchive(id: string): Promise<void> {
  return delay(() => {
    ensureSeed();
    const p = projects.find((x) => x.id === id && !x.deletedAt && x.archivedAt);
    if (!p) return fail('NOT_FOUND', 'Không tìm thấy Project đã lưu trữ');
    const stamp = p.archivedAt;
    tasks.forEach((t) => {
      if (t.projectId === id && t.archivedAt === stamp) delete t.archivedAt;
    });
    delete p.archivedAt;
    p.version += 1;
    p.updatedAt = nowIso();
    emit('project', [id]);
    emit('task');
  });
}

export function mockDashboardToday(): Promise<TodayView> {
  return delay(() => {
    ensureSeed();
    const today = todayStr();
    const now = nowIso();
    const archivedProjects = new Set(projects.filter((p) => p.archivedAt).map((p) => p.id));
    const open = tasks.filter(
      (t) =>
        !t.deletedAt &&
        !t.archivedAt &&
        t.status !== 'Done' &&
        !(t.projectId && archivedProjects.has(t.projectId)),
    );
    const byDue = (a: Task, b: Task) => dueKey(a).localeCompare(dueKey(b));
    const todayList = open
      .filter((t) => dayOf(t) === today)
      .sort(
        (a, b) =>
          Number(!!b.dueAt) - Number(!!a.dueAt) ||
          (a.dueAt ?? '').localeCompare(b.dueAt ?? '') ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      );
    const overdue = open
      .filter((t) => (!!t.dueDate && t.dueDate < today) || (!!t.dueAt && t.dueAt < now))
      .sort(byDue)
      .slice(0, 50);
    const upcoming = open
      .filter((t) => {
        const d = dayOf(t);
        return !!d && d > today && d <= addDays(today, 7);
      })
      .sort(byDue)
      .slice(0, 20);
    return {
      date: today,
      today: todayList.map(viewTask),
      overdue: overdue.map(viewTask),
      upcoming: upcoming.map(viewTask),
      activeProjects: sortedProjects()
        .filter((p) => !p.deletedAt && !p.archivedAt && p.status === 'Active')
        .map((p) => progressOf(p)),
      recentNotes: [],
    };
  });
}

function seedDemoInternal() {
  ensureSeed();
  if (projects.some((p) => !p.deletedAt && p.name.includes('GGStudio')))
    fail('CONFLICT', 'Đã có dữ liệu mẫu');
  const t0 = todayStr();
  const ensureArea = (name: string, color: string): Area => {
    let area = areas.find((a) => a.name === name);
    if (!area) {
      area = { id: crypto.randomUUID(), name, color, sortKey: '' };
      areas = [...areas, area];
      resort();
      area = areas[areas.length - 1] ?? area;
    }
    return area;
  };
  const work = ensureArea('Công việc', '#5B9BD5');
  const study = ensureArea('Học tập', '#A08BDF');
  const tagId = (name: string, color: string) => {
    let tag = tags.find((x) => x.name === name);
    if (!tag) {
      tag = { id: crypto.randomUUID(), name, color };
      tags.push(tag);
    }
    return tag.id;
  };
  const backend = tagId('backend', '#5B9BD5');
  const frontend = tagId('frontend', '#63BB91');
  const urgent = tagId('urgent', '#E57373');

  const gg = createProjectInternal({
    name: 'GGStudio — Gaming Services Marketplace',
    description: 'Sàn dịch vụ game: đặt lịch, thanh toán, quản trị.',
    areaId: work.id,
    status: 'Active',
    color: '#A08BDF',
    icon: 'gamepad-2',
    startDate: addDays(t0, -60),
    targetDate: addDays(t0, 45),
  });
  const mk = (over: Partial<Task> & { title: string }) => tasks.push(rawTask(over));
  const doneNames = ['Authentication', 'Database', 'Landing page'];
  for (let i = 0; i < 26; i++)
    mk({
      title: doneNames[i] ?? `Hoàn thiện module ${i - 2}`,
      status: 'Done',
      completedAt: nowIso(),
      projectId: gg.id,
      priority: i % 4 === 0 ? 'High' : 'Medium',
      tagIds: i % 2 === 0 ? [backend] : [frontend],
    });
  const g = { projectId: gg.id };
  mk({
    title: 'Booking system',
    status: 'InProgress',
    ...g,
    priority: 'High',
    dueDate: addDays(t0, 5),
    tagIds: [backend],
  });
  mk({
    title: 'Admin UI',
    status: 'InProgress',
    ...g,
    dueDate: addDays(t0, 3),
    tagIds: [frontend],
  });
  mk({
    title: 'Payment API',
    ...g,
    priority: 'Urgent',
    dueDate: addDays(t0, 7),
    tagIds: [backend, urgent],
  });
  mk({ title: 'Email service', ...g, dueDate: addDays(t0, 9), tagIds: [backend] });
  mk({ title: 'SEO', ...g, priority: 'Low', dueDate: addDays(t0, 14), tagIds: [frontend] });
  const rest: [string, TaskStatus, number][] = [
    ['Viết tài liệu API', 'Todo', -3],
    ['Sửa lỗi đăng nhập Google', 'Todo', -1],
    ['Thiết kế trang hồ sơ', 'Todo', 0],
    ['Kiểm thử thanh toán', 'Todo', 0],
    ['Tối ưu tốc độ tải trang', 'Todo', 0],
    ['Review code đặt lịch', 'Review', 2],
    ['Review giao diện Admin', 'Review', 4],
    ['Chuẩn bị bản demo', 'Review', 11],
    ['Triển khai bản thử', 'Review', 14],
  ];
  rest.forEach(([title, status, off]) => mk({ title, status, ...g, dueDate: addDays(t0, off) }));
  const thesis = createProjectInternal({
    name: 'Đồ án tốt nghiệp',
    areaId: study.id,
    status: 'Active',
    color: '#63BB91',
    icon: 'graduation-cap',
  });
  [
    'Chọn đề tài',
    'Viết đề cương',
    'Khảo sát tài liệu',
    'Cài đặt thử nghiệm',
    'Viết chương 1',
    'Làm slide',
  ].forEach((title, i) =>
    mk({
      title,
      projectId: thesis.id,
      status: i < 2 ? 'Done' : 'Todo',
      ...(i < 2 ? { completedAt: nowIso() } : { dueDate: addDays(t0, 5 + i * 3) }),
    }),
  );
  ['Đặt vé tàu về quê', 'Xem lại hợp đồng thuê nhà', 'Ý tưởng app theo dõi chi tiêu'].forEach(
    (content, i) =>
      inbox.unshift({
        id: crypto.randomUUID(),
        content,
        status: 'Open',
        createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
      }),
  );
}

export function mockSeedDemoData(): Promise<void> {
  return delay(() => {
    seedDemoInternal();
    emit('project');
    emit('task');
    emit('area');
    emit('tag');
    emit('inbox');
  });
}

// ---- lưu localStorage (chỉ khi chạy VITE_IPC_MOCK=1; `?resetMock=1` để xoá) ----
const STORE_KEY = 'lifehub.mock';
const persistent = import.meta.env.VITE_IPC_MOCK === '1' && typeof localStorage !== 'undefined';

function saveState() {
  if (!persistent) return;
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        areas,
        tags,
        tasks,
        checklists,
        inbox,
        projects,
        settings,
        keyCounter,
        previous: [...previousStatus],
      }),
    );
  } catch {
    /* bỏ qua: hết dung lượng hoặc bị chặn */
  }
}

type Stored = {
  areas: Area[];
  tags: Tag[];
  tasks: Task[];
  checklists: ChecklistItem[];
  inbox: InboxRec[];
  projects: ProjectRec[];
  settings: AppSettings;
  keyCounter: number;
  previous: [string, TaskStatus][];
};

function bootstrap() {
  if (!persistent) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('resetMock') === '1') {
      localStorage.removeItem(STORE_KEY);
      url.searchParams.delete('resetMock');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Stored;
      areas = d.areas;
      tags = d.tags;
      tasks = d.tasks;
      checklists = d.checklists;
      inbox.splice(0, inbox.length, ...d.inbox);
      projects = d.projects;
      settings = d.settings;
      keyCounter = d.keyCounter;
      previousStatus.clear();
      d.previous.forEach(([k, v]) => previousStatus.set(k, v));
      seeded = true;
      return;
    }
    seedDemoInternal();
    saveState();
  } catch {
    /* dữ liệu lưu hỏng: dùng dữ liệu khởi tạo */
  }
}
bootstrap();
