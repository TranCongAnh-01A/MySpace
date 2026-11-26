import { useT } from '@/lib/i18n';
import { utcToLocalParts } from '@/lib/tz';
import { cn } from '@/lib/utils';
import { useDateCtx } from '@/modules/tasks/hooks';
import type { SaveSnapshot } from './autosaveQueue';

/** "Đang lưu…", "Đã lưu lúc HH:mm", "Lỗi lưu, thử lại" (kèm nút). */
export function SaveIndicator({
  snapshot,
  onRetry,
}: {
  snapshot: SaveSnapshot;
  onRetry: () => void;
}) {
  const t = useT();
  const { timezone } = useDateCtx();
  const { status, savedAt } = snapshot;
  const text =
    status === 'saving'
      ? t('notes.save.saving')
      : status === 'dirty'
        ? t('notes.save.dirty')
        : status === 'error' || status === 'conflict'
          ? t('notes.save.error')
          : savedAt
            ? t('notes.save.saved', { time: utcToLocalParts(savedAt.toISOString(), timezone).time })
            : t('notes.save.idle');
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 text-xs tabular-nums',
        status === 'error' || status === 'conflict' ? 'text-danger' : 'text-muted',
      )}
    >
      <span>{text}</span>
      {(status === 'error' || status === 'conflict') && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-danger px-1.5 py-0.5 text-danger hover:bg-danger/10"
        >
          {t('notes.save.retry')}
        </button>
      )}
    </p>
  );
}
