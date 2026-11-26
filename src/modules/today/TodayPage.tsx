import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellOff, Check, Flag, Link2, Plus, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingBlock } from '@/components/ui/skeleton';
import { useUiStore } from '@/app/ui-store';
import { useT } from '@/lib/i18n';
import { errorMessage, taskUpdate } from '@/lib/ipc/commands';
import type { CalendarItem, Project, Task, TodayView } from '@/lib/ipc/contract';
import { localToUtc, utcToLocalParts } from '@/lib/tz';
import { cn } from '@/lib/utils';
import { ProjectIcon } from '@/modules/projects/icons';
import { ProgressBar } from '@/modules/projects/ProgressBar';
import { NoteListItems } from '@/modules/notes/NoteListItems';
import { useProjects } from '@/modules/projects/hooks';
import { useMissedReminders } from '@/modules/reminders/hooks';
import { CreateTaskDialog } from '@/modules/tasks/CreateTaskDialog';
import { dueInfo, type DateCtx } from '@/modules/tasks/dates';
import { invalidateTaskData, useCreateTask, useDateCtx, useSetStatus } from '@/modules/tasks/hooks';
import { TaskDetailPanel } from '@/modules/tasks/TaskDetailPanel';
import { todayHeading, useMidnightRefresh, useToday } from './hooks';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <Card className="py-3">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'danger' && value > 0 && 'text-danger',
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function Widget({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count?: number;
  empty: string;
  children: ReactNode;
}) {
  const hasItems = count === undefined || count > 0;
  return (
    <Card className="flex min-h-40 flex-col" aria-label={title}>
      <CardTitle className="mb-2 flex items-center justify-between">
        {title}
        {count !== undefined && (
          <span className="text-xs font-normal text-muted tabular-nums">{count}</span>
        )}
      </CardTitle>
      {hasItems ? children : <p className="py-4 text-center text-muted">{empty}</p>}
    </Card>
  );
}

/** Dòng thời gian hôm nay: Event và deadline, khác nhau bằng biểu tượng + chữ "Hạn". */
function ScheduleList({ items, date, ctx }: { items: CalendarItem[]; date: string; ctx: DateCtx }) {
  const t = useT();
  return (
    <ol className="space-y-1">
      {items.map((item) => {
        if (item.kind === 'Deadline') {
          const { task } = item;
          const done = task.status === 'Done';
          const time = task.dueAt
            ? utcToLocalParts(task.dueAt, ctx.timezone).time
            : t('today.allDay');
          return (
            <li key={`dl:${task.id}`}>
              <Link
                to={`/today/${task.id}`}
                className="flex items-center gap-2 rounded-md border border-dashed border-warning px-2 py-1.5 hover:bg-border/40"
              >
                <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{time}</span>
                <Flag className="size-4 shrink-0 text-warning" aria-hidden />
                <span className={cn('truncate', done && 'line-through')}>
                  <span className="font-medium text-warning">{t('today.deadlineTag')}: </span>
                  {task.title}
                </span>
              </Link>
            </li>
          );
        }
        const e = item.event;
        const time = e.isAllDay
          ? t('today.allDay')
          : `${utcToLocalParts(e.startAt ?? '', ctx.timezone).time}–${utcToLocalParts(e.endAt ?? '', ctx.timezone).time}`;
        return (
          <li key={`ev:${e.id}`}>
            <Link
              to={`/calendar?date=${date}&event=${e.id}`}
              className="flex items-center gap-2 rounded-md border-l-4 border-primary bg-surface px-2 py-1.5 hover:bg-border/40"
            >
              <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{time}</span>
              {e.taskId && <Link2 className="size-4 shrink-0 text-muted" aria-hidden />}
              <span className="truncate">{e.title}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function TaskRow({
  task,
  ctx,
  projectsById,
  activeId,
  onOpen,
  moveToToday,
}: {
  task: Task;
  ctx: DateCtx;
  projectsById: Map<string, Project>;
  activeId: string | undefined;
  onOpen: (id: string) => void;
  moveToToday?: (task: Task) => void;
}) {
  const t = useT();
  const setStatus = useSetStatus();
  const due = dueInfo(task, ctx, t);
  const project = task.projectId ? projectsById.get(task.projectId) : undefined;
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1.5',
        activeId === task.id && 'bg-border/50',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={t('tasks.markDone', { title: task.title })}
        disabled={setStatus.isPending}
        onClick={() => setStatus.mutate({ id: task.id, status: 'Done' })}
        className="flex size-5 shrink-0 items-center justify-center rounded border border-muted hover:border-success hover:text-success"
      >
        <Check className="size-3.5 opacity-0 hover:opacity-100" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="min-w-[7rem] flex-1 truncate rounded text-left hover:underline"
      >
        {task.title}
      </button>
      {project && (
        <span className="hidden max-w-32 shrink-0 items-center gap-1 text-xs text-muted sm:inline-flex">
          <ProjectIcon icon={project.icon} color={project.color} className="size-3" />
          <span className="truncate">{project.name}</span>
        </span>
      )}
      {due && (
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            due.overdue ? 'font-medium text-danger' : 'text-muted',
          )}
        >
          {due.label}
        </span>
      )}
      {moveToToday && (
        <Button
          variant="secondary"
          size="sm"
          aria-label={t('today.moveTodayAria', { title: task.title })}
          onClick={() => moveToToday(task)}
        >
          {t('today.moveToday')}
        </Button>
      )}
    </li>
  );
}

function Body({
  view,
  ctx,
  openId,
  onOpen,
}: {
  view: TodayView;
  ctx: DateCtx;
  openId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: projects = [] } = useProjects(false);
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const move = useMutation({
    mutationFn: (task: Task) =>
      taskUpdate(
        task.id,
        task.dueAt
          ? {
              dueAt: localToUtc(
                view.date,
                utcToLocalParts(task.dueAt, ctx.timezone).time,
                ctx.timezone,
              ),
            }
          : { dueDate: view.date },
        task.version,
      ),
    onSuccess: () => toast.success(t('today.moved')),
    onError: (e) => toast.error(t('common.error'), { description: errorMessage(e) }),
    onSettled: () => invalidateTaskData(qc),
  });
  const rows = (list: Task[], moveToToday?: (task: Task) => void) => (
    <ul>
      {list.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          ctx={ctx}
          projectsById={projectsById}
          activeId={openId}
          onOpen={onOpen}
          {...(moveToToday ? { moveToToday } : {})}
        />
      ))}
    </ul>
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('today.stat.today')} value={view.today.length} />
        <Stat
          label={t('today.stat.events')}
          value={view.schedule.filter((i) => i.kind === 'Event').length}
        />
        <Stat label={t('today.stat.overdue')} value={view.overdue.length} tone="danger" />
        <Stat label={t('today.stat.projects')} value={view.activeProjects.length} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Widget
          title={t('today.w.schedule')}
          count={view.schedule.length}
          empty={t('today.empty.schedule')}
        >
          <ScheduleList items={view.schedule} date={view.date} ctx={ctx} />
        </Widget>
        <Widget title={t('today.w.today')} count={view.today.length} empty={t('today.empty.today')}>
          {rows(view.today)}
        </Widget>
        <Widget
          title={t('today.w.overdue')}
          count={view.overdue.length}
          empty={t('today.empty.overdue')}
        >
          {rows(view.overdue, (task) => move.mutate(task))}
        </Widget>
        <Widget
          title={t('today.w.upcoming')}
          count={view.upcoming.length}
          empty={t('today.empty.upcoming')}
        >
          {rows(view.upcoming)}
        </Widget>
        <Widget
          title={t('notes.recent')}
          count={view.recentNotes.length}
          empty={t('notes.recentEmpty')}
        >
          <NoteListItems notes={view.recentNotes} label={t('notes.recent')} />
        </Widget>
        <Widget
          title={t('today.w.projects')}
          count={view.activeProjects.length}
          empty={t('today.empty.projects')}
        >
          <ul className="space-y-3">
            {view.activeProjects.map((p) => {
              const full = projectsById.get(p.projectId);
              return (
                <li key={p.projectId}>
                  <Link
                    to={`/projects/${p.projectId}`}
                    className="block space-y-1 rounded-md p-1 hover:bg-border/40"
                  >
                    <span className="flex items-center gap-2">
                      <ProjectIcon icon={full?.icon} color={p.color} />
                      <span className="truncate font-medium">{p.name}</span>
                    </span>
                    <ProgressBar progress={p} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Widget>
      </div>
    </>
  );
}

export function TodayPage() {
  const t = useT();
  const ctx = useDateCtx();
  const navigate = useNavigate();
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useToday();
  const [addOpen, setAddOpen] = useState(false);
  const create = useCreateTask(() => setAddOpen(false));
  useMidnightRefresh(ctx.timezone);
  const { data: missed } = useMissedReminders();
  const missedDeferred = useUiStore((s) => s.missedDeferred);
  const setMissedDeferred = useUiStore((s) => s.setMissedDeferred);

  let body;
  if (isLoading) body = <LoadingBlock label={t('common.loading')} rows={6} />;
  else if (error || !data)
    body = (
      <ErrorState
        title={t('common.loadError')}
        message={errorMessage(error)}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  else if (
    data.today.length +
      data.overdue.length +
      data.upcoming.length +
      data.activeProjects.length +
      data.schedule.length ===
    0
  )
    body = <EmptyState icon={<Sun />} title={t('today.empty.today')} />;
  else
    body = (
      <Body
        view={data}
        ctx={ctx}
        openId={id}
        onOpen={(taskId) => void navigate(`/today/${taskId}`)}
      />
    );

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">
            {data
              ? t('today.title', { date: todayHeading(data.date, ctx.language, ctx.dateFormat) })
              : t('nav.today')}
          </h1>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            {t('today.add')}
          </Button>
        </div>
        {missedDeferred && missed && missed.length > 0 && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border border-warning px-3 py-2"
          >
            <BellOff className="size-4 shrink-0 text-warning" aria-hidden />
            <span className="flex-1">{t('missed.banner', { n: missed.length })}</span>
            <Button variant="secondary" size="sm" onClick={() => setMissedDeferred(false)}>
              {t('missed.view')}
            </Button>
          </div>
        )}
        {body}
      </div>
      {id && <TaskDetailPanel key={id} id={id} onClose={() => void navigate('/today')} />}
      <CreateTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={t('today.addTitle')}
        submitLabel={t('create.submit')}
        defaultDueDate={data?.date}
        pending={create.isPending}
        error={create.error}
        onSubmit={(input) => create.mutate(input)}
      />
    </div>
  );
}
