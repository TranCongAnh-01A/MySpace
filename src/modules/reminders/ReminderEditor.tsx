import { useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/format/date';
import { useT, type TKey } from '@/lib/i18n';
import type { Reminder, ReminderSet } from '@/lib/ipc/contract';
import { todayIn } from '@/lib/tz';
import { dateToStr, strToDate } from '@/modules/tasks/dateInput';
import { useDateCtx } from '@/modules/tasks/hooks';
import { useSettings } from '@/modules/settings/hooks';
import { useDeleteReminder, useReminders, useSetReminder, type ReminderSource } from './hooks';
import { canUseOffset, fixedTrigger, offsetChoices, offsetLabel } from './offsets';

const FIXED = 'fixed';

/**
 * Nhắc nhở dùng chung cho Task và Event.
 * `hasOrigin` = nguồn có thời điểm gốc (hạn của Task / giờ bắt đầu của Event); không có thì ẩn mức nhắc trước.
 */
export function ReminderEditor({
  source,
  hasOrigin,
}: {
  source: ReminderSource;
  hasOrigin: boolean;
}) {
  const t = useT();
  const ctx = useDateCtx();
  const { data: settings } = useSettings();
  const { data: list = [], isLoading, error } = useReminders(source);
  const set = useSetReminder(source);
  const del = useDeleteReminder(source);
  const offsetOk = canUseOffset(hasOrigin);
  const defaultOffset = settings?.defaultReminderMinutes ?? 15;
  const choices = offsetChoices(defaultOffset);

  const [choice, setChoice] = useState<string>(offsetOk ? String(defaultOffset) : FIXED);
  const [date, setDate] = useState<string>(() => todayIn(ctx.timezone));
  const [time, setTime] = useState('09:00');
  // Mất thời điểm gốc thì không còn chọn được mức nhắc trước: rơi về "Giờ cụ thể".
  const effective = !offsetOk ? FIXED : choice;

  const add = () => {
    const base = source.kind === 'task' ? { taskId: source.id } : { eventId: source.id };
    const input: ReminderSet =
      effective === FIXED
        ? { ...base, triggerAt: fixedTrigger(date, time, ctx.timezone) }
        : { ...base, offsetMinutes: Number(effective) };
    set.mutate(input);
  };

  const statusLabel = (r: Reminder) => t(`rem.status.${r.status}` as TKey);
  const describe = (r: Reminder) =>
    r.offsetMinutes !== undefined ? offsetLabel(r.offsetMinutes, t) : t('rem.fixedAt');

  return (
    <section aria-labelledby="rem-title" className="space-y-2">
      <h3 id="rem-title" className="flex items-center gap-1.5 text-sm font-medium">
        <Bell className="size-4 text-muted" aria-hidden />
        {t('rem.title')}
      </h3>
      {isLoading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : error ? (
        <p role="alert" className="text-danger">
          {t('common.loadError')}
        </p>
      ) : list.length === 0 ? (
        <p className="text-muted">{t('rem.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {list.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{describe(r)}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {formatDateTime(r.triggerAt, ctx.dateFormat, ctx.timezone)}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-border px-2 text-xs text-muted">
                {statusLabel(r)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('rem.delete', {
                  label: `${describe(r)} ${formatDateTime(r.triggerAt, ctx.dateFormat, ctx.timezone)}`,
                })}
                disabled={del.isPending}
                onClick={() => del.mutate(r.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!offsetOk && <p className="text-xs text-muted">{t('rem.needDue')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={effective} onValueChange={setChoice}>
          <SelectTrigger aria-label={t('rem.when')} className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {offsetOk &&
              choices.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {offsetLabel(m, t)}
                </SelectItem>
              ))}
            <SelectItem value={FIXED}>{t('rem.fixed')}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" size="sm" disabled={set.isPending} onClick={add}>
          {t('rem.add')}
        </Button>
      </div>
      {effective === FIXED && (
        <div className="flex items-center gap-2">
          <DatePicker
            value={strToDate(date)}
            onChange={(d) => d && setDate(dateToStr(d))}
            language={ctx.language}
            dateFormat={ctx.dateFormat}
            placeholder={t('detail.pickDate')}
            ariaLabel={t('rem.fixedDate')}
            className="flex-1"
          />
          <Input
            type="time"
            aria-label={t('rem.fixedTime')}
            value={time}
            onChange={(e) => e.target.value && setTime(e.target.value)}
            className="w-28"
          />
        </div>
      )}
    </section>
  );
}
