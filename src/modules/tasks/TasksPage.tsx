import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckSquare, Columns3, List, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingBlock } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useT, type TKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';
import type { DueFilter, TaskFilter } from '@/lib/ipc/contract';
import { useUiStore } from '@/app/ui-store';
import {
  buildTasksSearch,
  DUES,
  parseTasksQuery,
  PRIORITIES,
  SORTS,
  STATUSES,
  type TasksQuery,
  type TasksView,
} from './filters';
import { useAreas, useDateCtx, useTags, useTasks } from './hooks';
import { TaskBoard } from './TaskBoard';
import { TaskDetailPanel } from './TaskDetailPanel';
import { TaskList } from './TaskList';
import { cn } from '@/lib/utils';

const ALL = '__all';

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
}) {
  const t = useT();
  const id = `f-${label}`;
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="text-muted">
        {label}
      </Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger id={id} className="h-8 min-w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('tasks.filter.all')}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TasksPage() {
  const t = useT();
  const ctx = useDateCtx();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const setCreateOpen = useUiStore((s) => s.setCreateTaskOpen);
  const query = parseTasksQuery(sp);
  const { filter, view } = query;
  const { data, isLoading, error, refetch } = useTasks(filter);
  const { data: tags = [] } = useTags();
  const { data: areas = [] } = useAreas();

  const update = (next: Partial<TasksQuery> & { filter?: TaskFilter }) =>
    setSp(new URLSearchParams(buildTasksSearch({ view, filter, ...next }).replace(/^\?/, '')), {
      replace: true,
    });
  const patchFilter = (p: Partial<TaskFilter>) => {
    const next: TaskFilter = { ...filter, ...p };
    (Object.keys(next) as (keyof TaskFilter)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    update({ filter: next });
  };
  const open = (taskId: string) => void navigate(`/tasks/${taskId}${search}`);
  const close = () => void navigate(`/tasks${search}`);

  const hasFilter = Object.keys(filter).length > 0;
  const quick: { value: DueFilter | undefined; label: string }[] = [
    { value: undefined, label: t('tasks.quick.all') },
    ...DUES.map((d) => ({ value: d, label: t(`tasks.quick.${d}` as TKey) })),
  ];
  const views: { value: TasksView; label: string; icon: typeof List }[] = [
    { value: 'list', label: t('tasks.viewList'), icon: List },
    { value: 'board', label: t('tasks.viewBoard'), icon: Columns3 },
  ];

  let body;
  if (isLoading) body = <LoadingBlock label={t('common.loading')} rows={6} />;
  else if (error)
    body = (
      <ErrorState
        title={t('common.loadError')}
        message={errorMessage(error)}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  else if (!data || data.length === 0)
    body = (
      <EmptyState
        icon={<CheckSquare />}
        title={hasFilter ? t('tasks.emptyFiltered') : t('tasks.empty')}
        hint={
          hasFilter ? undefined : (
            <>
              {t('tasks.emptyHint', { shortcut: '\u0000' }).split('\u0000')[0]}
              <Kbd>Ctrl+N</Kbd>
              {t('tasks.emptyHint', { shortcut: '\u0000' }).split('\u0000')[1]}
            </>
          )
        }
      />
    );
  else if (view === 'board') body = <TaskBoard tasks={data} ctx={ctx} openId={id} onOpen={open} />;
  else body = <TaskList tasks={data} tags={tags} ctx={ctx} openId={id} onOpen={open} />;

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{t('tasks.title')}</h1>
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label={t('tasks.views')}
              className="flex rounded-md border border-border"
            >
              {views.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={view === v.value}
                  onClick={() => update({ view: v.value })}
                  className={cn(
                    'flex h-8 items-center gap-1.5 px-3 text-sm first:rounded-l-md last:rounded-r-md',
                    view === v.value ? 'bg-primary text-primary-fg' : 'hover:bg-border/60',
                  )}
                >
                  <v.icon className="size-4" aria-hidden />
                  {v.label}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              {t('tasks.new')}
            </Button>
          </div>
        </div>

        <div role="group" aria-label={t('tasks.quick')} className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              aria-pressed={filter.due === q.value}
              onClick={() => patchFilter({ due: q.value })}
              className={cn(
                'h-7 rounded-full border px-3 text-xs',
                filter.due === q.value
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-border hover:bg-border/60',
              )}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterSelect
            label={t('tasks.filter.status')}
            value={filter.status?.[0] ?? ''}
            onChange={(v) =>
              patchFilter({ status: v ? STATUSES.filter((s) => s === v) : undefined })
            }
            options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as TKey) }))}
          />
          <FilterSelect
            label={t('tasks.filter.priority')}
            value={filter.priority?.[0] ?? ''}
            onChange={(v) =>
              patchFilter({ priority: v ? PRIORITIES.filter((p) => p === v) : undefined })
            }
            options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}` as TKey) }))}
          />
          <FilterSelect
            label={t('tasks.filter.tag')}
            value={filter.tagId ?? ''}
            onChange={(v) => patchFilter({ tagId: v })}
            options={tags.map((x) => ({ value: x.id, label: x.name }))}
          />
          <FilterSelect
            label={t('tasks.filter.area')}
            value={filter.areaId ?? ''}
            onChange={(v) => patchFilter({ areaId: v })}
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
          />
          <div className="flex items-center gap-1.5">
            <Label htmlFor="f-sort" className="text-muted">
              {t('tasks.filter.sort')}
            </Label>
            <Select
              value={filter.sort ?? 'Manual'}
              onValueChange={(v) =>
                patchFilter({ sort: v === 'Manual' ? undefined : (v as TaskFilter['sort']) })
              }
            >
              <SelectTrigger id="f-sort" className="h-8 min-w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`tasks.sort.${s}` as TKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="f-archived"
              checked={!!filter.archived}
              onCheckedChange={(v) => patchFilter({ archived: v ? true : undefined })}
            />
            <Label htmlFor="f-archived">{t('tasks.showArchived')}</Label>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      </div>
      {id && <TaskDetailPanel key={id} id={id} onClose={close} />}
    </div>
  );
}
