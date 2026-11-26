import { useRef, useState, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';
import type { Project, Tag, Task } from '@/lib/ipc/contract';
import { ProjectIcon } from '@/modules/projects/icons';
import { cn } from '@/lib/utils';
import { dueInfo, type DateCtx } from './dates';
import { useDeleteTask, useSetStatus } from './hooks';
import { PriorityBadge, RecurringIcon, TaskContextMenu } from './parts';
import { useTaskActions } from './useTaskActions';

const ROW_HEIGHT = 48;

function TaskRow({
  task,
  index,
  active,
  selected,
  tagsById,
  project,
  ctx,
  onOpen,
  onToggle,
}: {
  project?: Project | undefined;
  task: Task;
  index: number;
  active: boolean;
  selected: boolean;
  tagsById: Map<string, Tag>;
  ctx: DateCtx;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const actions = useTaskActions(task, onOpen);
  const due = dueInfo(task, ctx, t);
  const done = task.status === 'Done';
  return (
    <TaskContextMenu task={task} actions={actions}>
      <div
        id={`task-row-${task.id}`}
        role="option"
        aria-selected={selected}
        aria-posinset={index + 1}
        onClick={onOpen}
        className={cn(
          'absolute inset-x-0 flex cursor-default items-center gap-3 rounded-md border border-transparent px-3',
          selected ? 'border-primary bg-surface' : 'hover:bg-surface',
          active && 'bg-surface',
        )}
        style={{ height: ROW_HEIGHT - 4, transform: `translateY(${index * ROW_HEIGHT}px)` }}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          tabIndex={-1}
          aria-label={t(done ? 'tasks.markOpen' : 'tasks.markDone', { title: task.title })}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded border border-muted',
            done && 'border-success bg-success text-bg',
          )}
        >
          {done && <Check className="size-3.5" aria-hidden />}
        </button>
        <span className={cn('min-w-0 flex-1 truncate', done && 'text-muted line-through')}>
          {task.title}
        </span>
        {task.recurrence && <RecurringIcon />}
        {task.checklistTotal > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted tabular-nums"
            title={t('tasks.checklistCount', {
              done: task.checklistDone,
              total: task.checklistTotal,
            })}
          >
            <ListChecks className="size-3.5" aria-hidden />
            {task.checklistDone}/{task.checklistTotal}
          </span>
        )}
        {project && (
          <span
            className="inline-flex max-w-36 shrink-0 items-center gap-1 text-xs text-muted"
            title={project.name}
          >
            <ProjectIcon icon={project.icon} color={project.color} className="size-3" />
            <span className="truncate">{project.name}</span>
          </span>
        )}
        {task.tagIds.slice(0, 2).map((id) => {
          const tag = tagsById.get(id);
          return tag ? <Badge key={id}>{tag.name}</Badge> : null;
        })}
        <PriorityBadge priority={task.priority} />
        <span
          className={cn(
            'w-52 shrink-0 text-right text-xs whitespace-nowrap tabular-nums',
            due?.overdue ? 'font-medium text-danger' : 'text-muted',
          )}
        >
          {due && (
            <>
              {due.overdue && <span>{t('tasks.overdue')} · </span>}
              {due.label}
            </>
          )}
        </span>
      </div>
    </TaskContextMenu>
  );
}

type Props = {
  tasks: Task[];
  tags: Tag[];
  ctx: DateCtx;
  openId: string | undefined;
  onOpen: (id: string) => void;
  projectsById?: Map<string, Project>;
  /** Đang ở trang Project: không cần nhãn tên dự án. */
  hideProject?: boolean;
};

/** Danh sách ảo hoá. ↑/↓ chọn dòng, Enter mở panel, Space đổi Done, Delete xoá (hoàn tác 5 giây). */
export function TaskList({ tasks, tags, ctx, openId, onOpen, projectsById, hideProject }: Props) {
  const t = useT();
  const parentRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);
  const setStatus = useSetStatus();
  const remove = useDeleteTask();
  const tagsById = new Map(tags.map((x) => [x.id, x]));

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual: không truyền hàm của virtualizer xuống component memo hoá
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const current = tasks[Math.min(cursor, tasks.length - 1)];

  function move(to: number) {
    const next = Math.max(0, Math.min(tasks.length - 1, to));
    setCursor(next);
    virtualizer.scrollToIndex(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!current) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(cursor + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(cursor - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(tasks.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onOpen(current.id);
    } else if (e.key === ' ') {
      e.preventDefault();
      setStatus.mutate({ id: current.id, status: current.status === 'Done' ? 'Todo' : 'Done' });
    } else if (e.key === 'Delete') {
      e.preventDefault();
      remove.mutate(current.id);
    }
  }

  return (
    <div
      ref={parentRef}
      role="listbox"
      tabIndex={0}
      aria-label={t('tasks.list')}
      aria-activedescendant={current ? `task-row-${current.id}` : undefined}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-auto rounded-md"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const task = tasks[v.index];
          if (!task) return null;
          return (
            <TaskRow
              key={task.id}
              task={task}
              index={v.index}
              active={task.id === openId}
              selected={v.index === cursor}
              tagsById={tagsById}
              project={
                !hideProject && task.projectId ? projectsById?.get(task.projectId) : undefined
              }
              ctx={ctx}
              onOpen={() => {
                setCursor(v.index);
                onOpen(task.id);
              }}
              onToggle={() =>
                setStatus.mutate({ id: task.id, status: task.status === 'Done' ? 'Todo' : 'Done' })
              }
            />
          );
        })}
      </div>
    </div>
  );
}
