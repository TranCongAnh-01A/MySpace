import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';
import type { Task } from '@/lib/ipc/contract';
import { localToUtc, utcToLocalParts } from '@/lib/tz';
import { useDateCtx } from '@/modules/tasks/hooks';
import { useCreateEvent, useScheduleBlock } from './hooks';
import { EventTimeFields } from './EventTimeFields';
import { DEFAULT_BLOCK_MINUTES, partsError, partsToCreate, type EventParts } from './mapping';

/** Parts mặc định: hôm nay, từ giờ làm tròn tới 30 phút kế tiếp, dài 1 giờ. */
export function defaultParts(timeZone: string, now = new Date()): EventParts {
  const slot = new Date(Math.ceil(now.getTime() / 1_800_000) * 1_800_000);
  const s = utcToLocalParts(slot.toISOString(), timeZone);
  const e = utcToLocalParts(new Date(slot.getTime() + 3_600_000).toISOString(), timeZone);
  return {
    isAllDay: false,
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
  };
}

function CreateForm({ initial, onClose }: { initial: EventParts; onClose: () => void }) {
  const t = useT();
  const ctx = useDateCtx();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [parts, setParts] = useState(initial);
  const create = useCreateEvent(onClose);
  const invalid = !title.trim() || !!partsError(parts, ctx.timezone);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid)
          create.mutate(partsToCreate(parts, { title: title.trim(), description }, ctx.timezone));
      }}
      className="mt-3 space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ev-title">{t('cal.titleLabel')}</Label>
        <Input
          id="ev-title"
          autoFocus
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <EventTimeFields parts={parts} onChange={setParts} ctx={ctx} idPrefix="ev-new" />
      <div className="space-y-1.5">
        <Label htmlFor="ev-desc">{t('cal.description')}</Label>
        <Textarea
          id="ev-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {!!create.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(create.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={invalid || create.isPending}>
          {t('cal.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Dialog tạo Event; điền sẵn thời gian khi chọn một khoảng trên lịch. */
export function CreateEventDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: EventParts | undefined;
}) {
  const t = useT();
  const ctx = useDateCtx();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t('cal.createTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{t('cal.createTitle')}</DialogDescription>
        {open && (
          <CreateForm
            initial={initial ?? defaultParts(ctx.timezone)}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const t = useT();
  const ctx = useDateCtx();
  const base = defaultParts(ctx.timezone);
  const [date, setDate] = useState(
    task.dueDate ?? (task.dueAt ? utcToLocalParts(task.dueAt, ctx.timezone).date : base.startDate),
  );
  const [time, setTime] = useState(base.startTime);
  const [minutes, setMinutes] = useState(String(task.estimatedMinutes ?? DEFAULT_BLOCK_MINUTES));
  const schedule = useScheduleBlock(onClose);
  const n = Math.floor(Number(minutes));
  const invalid = !date || !time || !(n >= 1 && n <= 20160);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        const startAt = localToUtc(date, time, ctx.timezone);
        schedule.mutate({
          taskId: task.id,
          startAt,
          endAt: new Date(new Date(startAt).getTime() + n * 60000).toISOString(),
        });
      }}
      className="mt-3 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sch-date">{t('cal.schedule.date')}</Label>
          <Input id="sch-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sch-time">{t('cal.schedule.time')}</Label>
          <Input id="sch-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sch-min">{t('cal.schedule.minutes')}</Label>
        <Input
          id="sch-min"
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>
      {!!schedule.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(schedule.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={invalid || schedule.isPending}>
          {t('cal.schedule.submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Xếp lịch…": chọn ngày giờ cho Task bằng bàn phím (tương đương kéo thả). */
export function ScheduleDialog({ task, onClose }: { task: Task | undefined; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{t('cal.schedule.title')}</DialogTitle>
        <DialogDescription>{task?.title}</DialogDescription>
        {task && <ScheduleForm key={task.id} task={task} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
