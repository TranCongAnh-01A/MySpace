import type { DueFilter, Priority, TaskFilter, TaskSort, TaskStatus } from '@/lib/ipc/contract';

export type TasksView = 'list' | 'board';
export type TasksQuery = { view: TasksView; filter: TaskFilter };

export const STATUSES: readonly TaskStatus[] = ['Todo', 'InProgress', 'Review', 'Done'];
export const PRIORITIES: readonly Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
export const DUES: readonly DueFilter[] = ['Today', 'Overdue', 'Next7', 'None'];
export const SORTS: readonly TaskSort[] = ['Manual', 'DueDate', 'Priority', 'Created'];

const pick = <T extends string>(all: readonly T[], v: string | null): T | undefined =>
  all.find((x) => x === v);
const pickMany = <T extends string>(all: readonly T[], v: string | null): T[] =>
  (v ?? '')
    .split(',')
    .map((s) => pick(all, s))
    .filter((x): x is T => x !== undefined);

/** Bộ lọc nằm trên URL: `/tasks?view=board&due=Today&status=Todo,Review&priority=High&tag=…&area=…&sort=DueDate`. */
export function parseTasksQuery(sp: URLSearchParams): TasksQuery {
  const filter: TaskFilter = {};
  const status = pickMany(STATUSES, sp.get('status'));
  if (status.length) filter.status = status;
  const priority = pickMany(PRIORITIES, sp.get('priority'));
  if (priority.length) filter.priority = priority;
  const due = pick(DUES, sp.get('due'));
  if (due) filter.due = due;
  const sort = pick(SORTS, sp.get('sort'));
  if (sort) filter.sort = sort;
  const tag = sp.get('tag');
  if (tag) filter.tagId = tag;
  const area = sp.get('area');
  if (area) filter.areaId = area;
  if (sp.get('archived') === '1') filter.archived = true;
  return { view: sp.get('view') === 'board' ? 'board' : 'list', filter };
}

export function buildTasksSearch(q: TasksQuery): string {
  const sp = new URLSearchParams();
  if (q.view === 'board') sp.set('view', 'board');
  const f = q.filter;
  if (f.due) sp.set('due', f.due);
  if (f.status?.length) sp.set('status', f.status.join(','));
  if (f.priority?.length) sp.set('priority', f.priority.join(','));
  if (f.tagId) sp.set('tag', f.tagId);
  if (f.areaId) sp.set('area', f.areaId);
  if (f.sort && f.sort !== 'Manual') sp.set('sort', f.sort);
  if (f.archived) sp.set('archived', '1');
  const s = sp.toString();
  return s ? `?${s}` : '';
}
