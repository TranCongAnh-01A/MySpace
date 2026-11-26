import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format/date';
import { useT } from '@/lib/i18n';
import type { NoteSummary } from '@/lib/ipc/contract';
import { cn } from '@/lib/utils';
import { useDateCtx } from '@/modules/tasks/hooks';

/** Danh sách Note dạng liên kết: tiêu đề, trích đoạn, thời gian cập nhật. */
export function NoteListItems({
  notes,
  activeId,
  label,
}: {
  notes: readonly NoteSummary[];
  activeId?: string | undefined;
  label: string;
}) {
  const t = useT();
  const ctx = useDateCtx();
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {notes.map((n) => (
        <li key={n.id}>
          <Link
            to={`/notes/${n.id}`}
            aria-current={n.id === activeId ? 'page' : undefined}
            className={cn(
              'block space-y-0.5 px-3 py-2 hover:bg-border/40',
              n.id === activeId && 'bg-border/60',
            )}
          >
            <span className={cn('block truncate font-medium', !n.title && 'text-muted')}>
              {n.title || t('notes.untitled')}
            </span>
            {n.excerpt && (
              <span className="line-clamp-2 block text-xs text-muted">{n.excerpt}</span>
            )}
            <span className="block text-xs text-muted tabular-nums">
              {formatDateTime(n.updatedAt, ctx.dateFormat, ctx.timezone)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
