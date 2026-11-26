import { useT } from '@/lib/i18n';
import type { ProjectProgress } from '@/lib/ipc/contract';
import { cn } from '@/lib/utils';

/** Chữ tiến độ: "26/40 việc · 65%"; chưa có Task thì "Chưa có công việc" (không hiện 0%). */
export function progressText(p: ProjectProgress, t: ReturnType<typeof useT>): string {
  if (p.percent === undefined) return t('proj.noTasks');
  return t('proj.progressText', { done: p.done, total: p.total, percent: p.percent });
}

/** Thanh tiến độ có role="progressbar"; không có `percent` thì chỉ hiện thanh rỗng. */
export function ProgressBar({
  progress,
  showText = true,
  className,
}: {
  progress: ProjectProgress;
  showText?: boolean;
  className?: string;
}) {
  const t = useT();
  const text = progressText(progress, t);
  const has = progress.percent !== undefined;
  return (
    <div className={cn('space-y-1', className)}>
      <div
        {...(has
          ? {
              role: 'progressbar',
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': progress.percent,
            }
          : { role: 'img' })}
        aria-label={`${t('proj.progress')}: ${text}`}
        className="h-2 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress.percent ?? 0}%`, background: progress.color }}
        />
      </div>
      {showText && <p className="text-xs text-muted tabular-nums">{text}</p>}
    </div>
  );
}
