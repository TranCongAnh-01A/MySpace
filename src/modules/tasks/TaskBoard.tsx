import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useT, type TKey } from '@/lib/i18n';
import type { Task, TaskStatus } from '@/lib/ipc/contract';
import { cn } from '@/lib/utils';
import { dueInfo, type DateCtx } from './dates';
import { STATUSES } from './filters';
import { useMoveTask, useSetStatus } from './hooks';
import { columnId, computeMoveTarget, type Columns } from './moveTarget';
import { PriorityBadge, RecurringIcon, TaskContextMenu } from './parts';
import { useTaskActions } from './useTaskActions';

function Card({
  task,
  ctx,
  active,
  onOpen,
}: {
  task: Task;
  ctx: DateCtx;
  active: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { status: task.status } });
  const actions = useTaskActions(task, onOpen);
  const due = dueInfo(task, ctx, t);
  return (
    <TaskContextMenu task={task} actions={actions}>
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          'rounded-md border bg-surface p-2',
          active ? 'border-primary' : 'border-border',
          isDragging && 'z-10 opacity-80 shadow-lg',
        )}
      >
        <div className="flex items-start gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={t('tasks.drag', { title: task.title })}
            className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted hover:text-text"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left break-words">
            {task.title}
          </button>
          {task.recurrence && <RecurringIcon />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          <PriorityBadge priority={task.priority} />
          {due && (
            <span
              className={cn(
                'text-xs tabular-nums',
                due.overdue ? 'font-medium text-danger' : 'text-muted',
              )}
            >
              {due.overdue && `${t('tasks.overdue')} · `}
              {due.label}
            </span>
          )}
        </div>
      </li>
    </TaskContextMenu>
  );
}

function Column({
  status,
  tasks,
  ctx,
  openId,
  onOpen,
}: {
  status: TaskStatus;
  tasks: Task[];
  ctx: DateCtx;
  openId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });
  const label = t(`status.${status}` as TKey);
  return (
    <section
      aria-label={t('tasks.column', { status: label })}
      className={cn(
        'flex min-h-0 w-64 shrink-0 flex-col rounded-lg border bg-sidebar p-2',
        isOver ? 'border-primary' : 'border-border',
      )}
    >
      <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
        {label}
        <span className="text-xs font-normal text-muted tabular-nums">{tasks.length}</span>
      </h3>
      <SortableContext items={tasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="min-h-16 flex-1 space-y-2 overflow-auto">
          {tasks.map((task) => (
            <Card
              key={task.id}
              task={task}
              ctx={ctx}
              active={task.id === openId}
              onOpen={() => onOpen(task.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

/** Kanban 4 cột; thả xong gọi `taskMove` với beforeId/afterId lấy từ thẻ trên/dưới trong cột đích. */
export function TaskBoard({
  tasks,
  ctx,
  openId,
  onOpen,
}: {
  tasks: Task[];
  ctx: DateCtx;
  openId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const move = useMoveTask();
  useSetStatus();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byStatus = (s: TaskStatus) =>
    tasks.filter((x) => x.status === s).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const columns: Columns = {
    Todo: byStatus('Todo').map((x) => x.id),
    InProgress: byStatus('InProgress').map((x) => x.id),
    Review: byStatus('Review').map((x) => x.id),
    Done: byStatus('Done').map((x) => x.id),
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const target = computeMoveTarget(columns, String(active.id), String(over.id));
    if (target) move.mutate({ id: String(active.id), ...target });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions: { draggable: t('tasks.dragHint') } }}
    >
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={tasks
              .filter((x) => x.status === s)
              .sort((a, b) => a.sortKey.localeCompare(b.sortKey))}
            ctx={ctx}
            openId={openId}
            onOpen={onOpen}
          />
        ))}
      </div>
    </DndContext>
  );
}
