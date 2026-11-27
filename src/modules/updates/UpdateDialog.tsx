import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import { realDeps } from './deps';
import { useUpdateStore } from './store';

/** Hiện khi có bản mới (tự kiểm tra hoặc người dùng bấm "Kiểm tra cập nhật"). Ghi chú hiện dạng văn bản thuần. */
export function UpdateDialog() {
  const t = useT();
  const { status, update, progress, error, errorStage, dismissed, install, dismiss } =
    useUpdateStore();
  const installing = status === 'installing';
  const failedInstall = status === 'error' && errorStage === 'install';
  const open = !!update && (installing || failedInstall || (status === 'available' && !dismissed));
  if (!update) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !installing && dismiss()}>
      <DialogContent
        className="max-w-lg"
        aria-label={t('update.dialogAria')}
        onEscapeKeyDown={(e) => installing && e.preventDefault()}
        onInteractOutside={(e) => installing && e.preventDefault()}
      >
        <DialogTitle>{t('update.title', { version: update.version })}</DialogTitle>
        <DialogDescription>{t('update.desc')}</DialogDescription>
        {update.body ? (
          <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-bg p-3 font-sans text-sm whitespace-pre-wrap">
            {update.body}
          </pre>
        ) : null}
        {installing ? (
          <div className="mt-3" role="status" aria-live="polite">
            <progress
              className="h-2 w-full"
              max={100}
              {...(progress === null ? {} : { value: progress })}
              aria-label={t('update.progressAria')}
            />
            <p className="mt-1 text-sm text-muted tabular-nums">
              {progress === null ? t('update.preparing') : t('update.downloading', { n: progress })}
            </p>
          </div>
        ) : null}
        {failedInstall ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {t('update.failed', { reason: error ?? '' })}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={installing} onClick={dismiss}>
            {t('update.later')}
          </Button>
          <Button disabled={installing} onClick={() => void install(realDeps)}>
            {failedInstall ? t('common.retry') : t('update.install')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
