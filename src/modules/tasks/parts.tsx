import type { ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUp, Repeat } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/menus';
import { useT, type TKey } from '@/lib/i18n';
import type { Priority, Task, TaskStatus } from '@/lib/ipc/contract';
import { cn } from '@/lib/utils';
import { PRIORITIES, STATUSES } from './filters';

const PRIORITY_STYLE: Record<Priority, { icon: ReactNode; cls: string }> = {
  Urgent: { icon: <AlertTriangle />, cls: 'text-danger' },
  High: { icon: <ChevronsUp />, cls: 'text-warning' },
  Medium: { icon: <ArrowUp className="opacity-0" />, cls: 'text-muted' },
  Low: { icon: <ArrowDown />, cls: 'text-muted' },
};

/** Huy hiệu ưu tiên: luôn có chữ (và biểu tượng), không chỉ dùng màu. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useT();
  const s = PRIORITY_STYLE[priority];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs',
        s.cls,
      )}
    >
      <span aria-hidden className="[&_svg]:size-3">
        {s.icon}
      </span>
      {t(`priority.${priority}` as TKey)}
    </span>
  );
}

export function RecurringIcon() {
  const t = useT();
  return <Repeat aria-label={t('tasks.recurring')} role="img" className="size-3.5 text-muted" />;
}

type MenuActions = {
  onOpen: () => void;
  onStatus: (s: TaskStatus) => void;
  onPriority: (p: Priority) => void;
  onArchive: () => void;
  onDelete: () => void;
};

/** Context menu (chuột phải / Shift+F10) cho một Task. */
export function TaskContextMenu({
  task,
  actions,
  children,
}: {
  task: Task;
  actions: MenuActions;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={actions.onOpen}>{t('ctx.open')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>{t('ctx.status')}</ContextMenuLabel>
        {STATUSES.map((s) => (
          <ContextMenuItem key={s} onSelect={() => actions.onStatus(s)}>
            {t(`status.${s}` as TKey)}
            {s === task.status && <span aria-hidden>✓</span>}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuLabel>{t('ctx.priority')}</ContextMenuLabel>
        {PRIORITIES.map((p) => (
          <ContextMenuItem key={p} onSelect={() => actions.onPriority(p)}>
            {t(`priority.${p}` as TKey)}
            {p === task.priority && <span aria-hidden>✓</span>}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={actions.onArchive}>
          {task.archivedAt ? t('ctx.unarchive') : t('ctx.archive')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.onDelete}>{t('ctx.delete')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
