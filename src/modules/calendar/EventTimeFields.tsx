import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n';
import { dateToStr, strToDate } from '@/modules/tasks/dateInput';
import type { DateCtx } from '@/modules/tasks/dates';
import { partsError, shiftParts, toggleAllDay, type EventParts } from './mapping';

/** Cả ngày / có giờ + ngày giờ bắt đầu, kết thúc. Dùng trong dialog tạo và panel sửa Event. */
export function EventTimeFields({
  parts,
  onChange,
  ctx,
  idPrefix,
}: {
  parts: EventParts;
  onChange: (next: EventParts) => void;
  ctx: DateCtx;
  idPrefix: string;
}) {
  const t = useT();
  const error = partsError(parts, ctx.timezone);
  const row = (
    label: string,
    date: string,
    time: string,
    onDate: (d: string) => void,
    onTime: (v: string) => void,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-${label}-date`}>{label}</Label>
      <div className="flex items-center gap-2">
        <DatePicker
          value={strToDate(date)}
          onChange={(d) => d && onDate(dateToStr(d))}
          language={ctx.language}
          dateFormat={ctx.dateFormat}
          placeholder={t('detail.pickDate')}
          ariaLabel={label}
          className="flex-1"
        />
        {!parts.isAllDay && (
          <Input
            type="time"
            aria-label={`${label} — ${t('detail.time')}`}
            value={time}
            onChange={(e) => e.target.value && onTime(e.target.value)}
            className="w-28"
          />
        )}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch
          id={`${idPrefix}-allday`}
          checked={parts.isAllDay}
          onCheckedChange={(v) => onChange(toggleAllDay(parts, v, ctx.timezone))}
        />
        <Label htmlFor={`${idPrefix}-allday`}>{t('cal.allDay')}</Label>
      </div>
      {row(
        t('cal.start'),
        parts.startDate,
        parts.startTime,
        (startDate) => onChange(shiftParts(parts, { startDate }, ctx.timezone)),
        (startTime) => onChange(shiftParts(parts, { startTime }, ctx.timezone)),
      )}
      {row(
        t('cal.end'),
        parts.endDate,
        parts.endTime,
        (endDate) => onChange({ ...parts, endDate }),
        (endTime) => onChange({ ...parts, endTime }),
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t('cal.endError')}
        </p>
      )}
    </div>
  );
}
