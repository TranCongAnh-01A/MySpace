import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/app/ui-store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format/date';
import { useT } from '@/lib/i18n';
import type { MissedReminder } from '@/lib/ipc/contract';
import { utcToLocalParts } from '@/lib/tz';
import { useDateCtx } from '@/modules/tasks/hooks';
import { useDismissReminder, useMissedReminders } from './hooks';
import { routeFor } from './offsets';

/** Hiện khi app khởi động (và khi có thay đổi nhắc nhở) nếu có nhắc nhở bị lỡ. */
export function MissedRemindersDialog() {
  const t = useT();
  const ctx = useDateCtx();
  const navigate = useNavigate();
  const { data = [] } = useMissedReminders();
  const deferred = useUiStore((s) => s.missedDeferred);
  const setDeferred = useUiStore((s) => s.setMissedDeferred);
  const dismiss = useDismissReminder();
  const open = !deferred && data.length > 0;

  const openItem = (m: MissedReminder) => {
    setDeferred(true);
    const { taskId, eventId } = m.reminder;
    void navigate(
      routeFor(
        { ...(taskId ? { taskId } : {}), ...(eventId ? { eventId } : {}) },
        utcToLocalParts(m.dueLabelAt, ctx.timezone).date,
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setDeferred(true)}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('missed.title', { n: data.length })}</DialogTitle>
        <DialogDescription>{t('missed.desc')}</DialogDescription>
        <ul className="mt-3 max-h-72 space-y-1 overflow-auto">
          {data.map((m) => (
            <li
              key={m.reminder.id}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.title || t('missed.deleted')}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {formatDateTime(m.dueLabelAt, ctx.dateFormat, ctx.timezone)}
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('missed.openAria', { title: m.title })}
                onClick={() => openItem(m)}
              >
                {t('missed.open')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('missed.dismissAria', { title: m.title })}
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(m.reminder.id)}
              >
                {t('missed.dismiss')}
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeferred(true)}>
            {t('missed.later')}
          </Button>
          <Button
            variant="secondary"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate('all')}
          >
            {t('missed.dismissAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
