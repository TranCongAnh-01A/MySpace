import { Card, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format/date';
import { useT, type TKey } from '@/lib/i18n';
import type { ProjectOverview, TaskStatus } from '@/lib/ipc/contract';
import { dueInfo } from '@/modules/tasks/dates';
import { DraftField } from '@/modules/tasks/TaskDetailPanel';
import { useDateCtx, useTasks } from '@/modules/tasks/hooks';
import { cn } from '@/lib/utils';
import { useUpdateProject } from './hooks';
import { ProgressBar } from './ProgressBar';

const COUNT_ORDER: { key: keyof ProjectOverview['counts']; status: TaskStatus }[] = [
  { key: 'todo', status: 'Todo' },
  { key: 'inProgress', status: 'InProgress' },
  { key: 'review', status: 'Review' },
  { key: 'done', status: 'Done' },
];

export function ProjectOverviewTab({
  overview,
  onOpenTask,
}: {
  overview: ProjectOverview;
  onOpenTask: (id: string) => void;
}) {
  const t = useT();
  const ctx = useDateCtx();
  const { project, progress, counts } = overview;
  const update = useUpdateProject(project);
  const { data: tasks = [] } = useTasks({ projectId: project.id, sort: 'DueDate' });
  const upcoming = tasks.filter((x) => x.status !== 'Done' && (x.dueDate || x.dueAt)).slice(0, 5);
  const dateText = (d: string | undefined) =>
    d ? formatDate(`${d}T12:00:00.000Z`, ctx.dateFormat, 'UTC') : '—';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <CardTitle>{t('proj.progress')}</CardTitle>
        <ProgressBar progress={progress} />
        <dl aria-label={t('proj.counts')} className="grid grid-cols-4 gap-2 text-center">
          {COUNT_ORDER.map((c) => (
            <div key={c.key} className="rounded-md border border-border py-2">
              <dd className="text-lg font-semibold tabular-nums">{counts[c.key]}</dd>
              <dt className="text-xs text-muted">{t(`status.${c.status}` as TKey)}</dt>
            </div>
          ))}
        </dl>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted">{t('proj.startDate')}</dt>
            <dd className="tabular-nums">{dateText(project.startDate)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('proj.targetDate')}</dt>
            <dd className="tabular-nums">{dateText(project.targetDate)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-3">
        <DraftField
          id="proj-desc"
          label={t('proj.description')}
          value={project.description}
          multiline
          onCommit={(description) => update.mutate({ description })}
        />
      </Card>

      <Card className="lg:col-span-2">
        <CardTitle>{t('proj.upcoming')}</CardTitle>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-muted">{t('proj.upcomingEmpty')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {upcoming.map((task) => {
              const due = dueInfo(task, ctx, t);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-border/40"
                  >
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {due && (
                      <span
                        className={cn(
                          'shrink-0 text-xs tabular-nums',
                          due.overdue ? 'font-medium text-danger' : 'text-muted',
                        )}
                      >
                        {due.overdue && `${t('tasks.overdue')} · `}
                        {due.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
