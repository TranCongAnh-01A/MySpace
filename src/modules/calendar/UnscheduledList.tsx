import { useEffect, useRef } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import { CalendarPlus, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import type { Task } from '@/lib/ipc/contract';
import { dueInfo } from '@/modules/tasks/dates';
import { useDateCtx } from '@/modules/tasks/hooks';
import { DEFAULT_BLOCK_MINUTES } from './mapping';

/** Cột trái "Chưa xếp lịch": kéo Task vào lịch để tạo time block; nút "Xếp lịch…" cho bàn phím. */
export function UnscheduledList({
  tasks,
  loading,
  collapsed,
  onToggle,
  onSchedule,
}: {
  tasks: Task[];
  loading: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSchedule: (task: Task) => void;
}) {
  const t = useT();
  const ctx = useDateCtx();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const drag = new Draggable(el, {
      itemSelector: '.lh-draggable',
      eventData: (item) => ({
        title: item.dataset.title ?? '',
        duration: { minutes: Number(item.dataset.minutes) || DEFAULT_BLOCK_MINUTES },
        create: false,
      }),
    });
    return () => drag.destroy();
  }, [collapsed]);

  return (
    <aside
      aria-label={t('cal.unscheduled')}
      className={
        collapsed
          ? 'flex w-10 shrink-0 flex-col items-center border-r border-border py-2'
          : 'flex w-64 shrink-0 flex-col border-r border-border'
      }
    >
      <div className="flex items-center justify-between gap-1 px-2 py-2">
        {!collapsed && (
          <h2 className="truncate text-sm font-medium">
            {t('cal.unscheduled')}
            <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">
              {tasks.length}
            </span>
          </h2>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? t('cal.unscheduled.expand') : t('cal.unscheduled.collapse')}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>
      </div>
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          <p className="mb-2 text-xs text-muted">{t('cal.unscheduled.hint')}</p>
          {loading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : tasks.length === 0 ? (
            <p className="py-4 text-center text-muted">{t('cal.unscheduled.empty')}</p>
          ) : null}
          <ul ref={listRef} className="space-y-1">
            {tasks.map((task) => {
              const due = dueInfo(task, ctx, t);
              return (
                <li
                  key={task.id}
                  data-title={task.title}
                  data-task-id={task.id}
                  data-minutes={task.estimatedMinutes ?? DEFAULT_BLOCK_MINUTES}
                  className="lh-draggable flex cursor-grab items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-1.5"
                >
                  <GripVertical className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{task.title}</span>
                    <span className="block text-xs text-muted tabular-nums">
                      {task.estimatedMinutes ?? DEFAULT_BLOCK_MINUTES} {t('cal.minutesShort')}
                      {due ? ` · ${due.label}` : ''}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('cal.schedule.aria', { title: task.title })}
                    title={t('cal.schedule.open')}
                    onClick={() => onSchedule(task)}
                  >
                    <CalendarPlus />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
