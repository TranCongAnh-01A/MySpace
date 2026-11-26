import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format/date';
import { useT } from '@/lib/i18n';
import type { Event } from '@/lib/ipc/contract';
import { ReminderEditor } from '@/modules/reminders/ReminderEditor';
import { DraftField } from '@/modules/tasks/TaskDetailPanel';
import { useDateCtx } from '@/modules/tasks/hooks';
import { EventTimeFields } from './EventTimeFields';
import { useDeleteEvent, useUpdateEvent } from './hooks';
import { eventParts, partsError, partsToPatch, type EventParts } from './mapping';

function PanelBody({ event, onClose }: { event: Event; onClose: () => void }) {
  const t = useT();
  const ctx = useDateCtx();
  const update = useUpdateEvent();
  const del = useDeleteEvent(onClose);
  const [confirm, setConfirm] = useState(false);
  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate({ event, patch });

  // Nháp thời gian: chỉ lưu khi hợp lệ (kết thúc sau bắt đầu).
  const saved = eventParts(event, ctx.timezone);
  const [draft, setDraft] = useState<{ base: Event; parts: EventParts }>({
    base: event,
    parts: saved,
  });
  const parts = draft.base === event ? draft.parts : saved;
  const change = (next: EventParts) => {
    setDraft({ base: event, parts: next });
    if (!partsError(next, ctx.timezone)) save(partsToPatch(next, ctx.timezone));
  };

  return (
    <div className="space-y-4">
      <DraftField
        id="ev-title"
        label={t('cal.titleLabel')}
        value={event.title}
        onCommit={(title) => title.trim() && save({ title })}
      />
      <DraftField
        id="ev-desc"
        label={t('cal.description')}
        value={event.description}
        multiline
        onCommit={(description) => save({ description })}
      />
      <EventTimeFields parts={parts} onChange={change} ctx={ctx} idPrefix="ev" />
      {event.taskId && (
        <Link
          to={`/calendar?task=${event.taskId}`}
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          <Link2 className="size-4" aria-hidden />
          {t('cal.openTask')}
        </Link>
      )}
      <ReminderEditor source={{ kind: 'event', id: event.id }} hasOrigin />
      <dl className="space-y-0.5 border-t border-border pt-3 text-xs text-muted">
        <div className="flex gap-2">
          <dt>{t('detail.updated')}:</dt>
          <dd className="tabular-nums">
            {formatDateTime(event.updatedAt, ctx.dateFormat, ctx.timezone)}
          </dd>
        </div>
      </dl>
      <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
        <Trash2 />
        {t('cal.delete')}
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('cal.deleteTitle', { title: event.title })}</AlertDialogTitle>
          <AlertDialogDescription>{t('cal.deleteDesc')}</AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate(event.id)}>
              {t('common.delete')}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Panel bên phải của Event: sửa tiêu đề, mô tả, thời gian, nhắc nhở; xoá. `Esc` đóng. */
export function EventPanel({ event, onClose }: { event: Event; onClose: () => void }) {
  const t = useT();
  return (
    <aside
      aria-label={t('cal.panelTitle')}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) onClose();
      }}
      className="flex w-[26rem] shrink-0 flex-col border-l border-border bg-bg"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="font-semibold">{t('cal.panelTitle')}</h2>
        <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <PanelBody key={event.id} event={event} onClose={onClose} />
      </div>
    </aside>
  );
}
