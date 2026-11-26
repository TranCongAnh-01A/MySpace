import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDateCtx } from '@/modules/tasks/hooks';
import { useT } from '@/lib/i18n';
import { calendarRange, reminderList, taskGet } from '@/lib/ipc/commands';
import type { ReminderFired } from '@/lib/ipc/contract';
import { onNavigate, onReminderFired } from '@/lib/ipc/events';
import { reminderTargetDay, routeFor } from '@/modules/reminders/offsets';
import { todayIn } from '@/lib/tz';

/** Tiêu đề + route của bản ghi mà nhắc nhở vừa phát trỏ tới. */
async function resolveFired(
  p: ReminderFired,
  timeZone: string,
): Promise<{ title: string; route: string }> {
  if (p.taskId) {
    const d = await taskGet(p.taskId);
    return { title: d.task.title, route: routeFor({ taskId: p.taskId }, undefined) };
  }
  const eventId = p.eventId ?? '';
  const reminders = await reminderList(undefined, eventId);
  const r = reminders.find((x) => x.id === p.reminderId);
  const day = r ? reminderTargetDay(r, timeZone) : todayIn(timeZone);
  const items = await calendarRange(day, day);
  const hit = items.find((i) => i.kind === 'Event' && i.event.id === eventId);
  return { title: hit?.kind === 'Event' ? hit.event.title : '', route: routeFor({ eventId }, day) };
}

/**
 * Event do core phát:
 * - `navigate`: mở route (bấm vào thông báo Windows).
 * - `reminder-fired`: cửa sổ đang có focus thì hiện thêm toast trong app; không focus thì thôi (Windows đã hiện thông báo).
 */
export function useCoreEvents() {
  const navigate = useNavigate();
  const t = useT();
  const { timezone } = useDateCtx();
  useEffect(() => {
    let disposed = false;
    const unlisten: (() => void)[] = [];
    const keep = (fn: () => void) => (disposed ? fn() : unlisten.push(fn));
    void onNavigate((e) => void navigate(e.route)).then(keep);
    void onReminderFired((p) => {
      if (!document.hasFocus()) return;
      void resolveFired(p, timezone)
        .then(({ title, route }) =>
          toast(t('rem.fired'), {
            description: title,
            action: { label: t('missed.open'), onClick: () => void navigate(route) },
          }),
        )
        .catch(() => toast(t('rem.fired')));
    }).then(keep);
    return () => {
      disposed = true;
      unlisten.forEach((fn) => fn());
    };
  }, [navigate, t, timezone]);
}
