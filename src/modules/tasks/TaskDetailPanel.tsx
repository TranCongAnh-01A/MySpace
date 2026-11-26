import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { ErrorState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingBlock } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format/date';
import { useT, type TKey } from '@/lib/i18n';
import { errorCode, errorMessage, taskSetTags, taskUpdate } from '@/lib/ipc/commands';
import type {
  Frequency,
  Priority,
  Recurrence,
  Task,
  TaskDetail,
  TaskPatch,
  TaskStatus,
  Weekday,
} from '@/lib/ipc/contract';
import { localToUtc, todayIn, utcToLocalParts } from '@/lib/tz';
import { cn } from '@/lib/utils';
import { Checklist } from './Checklist';
import { dateToStr, strToDate } from './dateInput';
import { dueDay, type DateCtx } from './dates';
import { PRIORITIES, STATUSES } from './filters';
import { useAreas, useDateCtx, useSetStatus, useTask } from './hooks';
import { TagPicker } from './TagPicker';

const NO_AREA = '__none';
const WEEKDAYS: Weekday[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const FREQS: Frequency[] = ['Daily', 'Weekly', 'Monthly'];
type DueMode = 'none' | 'date' | 'datetime';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** Ô nhập có nháp cục bộ: lưu khi blur hoặc sau 800 ms không gõ. Lỗi CONFLICT không làm mất nội dung đang gõ. */
function DraftField({
  id,
  label,
  value,
  onCommit,
  multiline,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (draft === prev) setDraft(value);
  }
  const latest = useRef({ draft, value, onCommit });
  useEffect(() => {
    latest.current = { draft, value, onCommit };
  });
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => {
      if (latest.current.draft !== latest.current.value)
        latest.current.onCommit(latest.current.draft);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [draft, value]);
  const blur = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <Field id={id} label={label}>
      {multiline ? (
        <Textarea id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={blur} />
      ) : (
        <Input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={blur} />
      )}
    </Field>
  );
}

function OptionalDate({
  value,
  onChange,
  ctx,
  label,
}: {
  value: string | undefined;
  onChange: (v: string | null) => void;
  ctx: DateCtx;
  label: string;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1">
      <DatePicker
        value={strToDate(value)}
        onChange={(d) => onChange(d ? dateToStr(d) : null)}
        language={ctx.language}
        dateFormat={ctx.dateFormat}
        placeholder={t('detail.pickDate')}
        ariaLabel={label}
        className="flex-1"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${t('ctx.delete')}: ${label}`}
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      )}
    </div>
  );
}

function PanelBody({ detail, ctx }: { detail: TaskDetail; ctx: DateCtx }) {
  const t = useT();
  const qc = useQueryClient();
  const { task, checklist } = detail;
  const { data: areas = [] } = useAreas();
  const setStatus = useSetStatus();

  const update = useMutation({
    mutationFn: (patch: TaskPatch) => taskUpdate(task.id, patch, task.version),
    onSuccess: (saved: Task) => {
      qc.setQueryData<TaskDetail>(['task', task.id], (d) => (d ? { ...d, task: saved } : d));
    },
    onError: (e) => {
      if (errorCode(e) === 'CONFLICT') toast.error(t('tasks.conflict'));
      else toast.error(t('detail.saveError'), { description: errorMessage(e) });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['task', task.id] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const setTags = useMutation({
    mutationFn: (ids: string[]) => taskSetTags(task.id, ids),
    onError: (e) => toast.error(t('detail.saveError'), { description: errorMessage(e) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['task', task.id] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const save = (patch: TaskPatch) => update.mutate(patch);

  const mode: DueMode = task.dueAt ? 'datetime' : task.dueDate ? 'date' : 'none';
  const day = dueDay(task, ctx.timezone);
  const time = task.dueAt ? utcToLocalParts(task.dueAt, ctx.timezone).time : '09:00';

  function changeMode(next: DueMode) {
    const base = day ?? todayIn(ctx.timezone);
    if (next === 'none') save({ dueDate: null, dueAt: null });
    else if (next === 'date') save({ dueDate: base, dueAt: null });
    else save({ dueAt: localToUtc(base, time, ctx.timezone), dueDate: null });
  }
  function changeDay(v: string | null) {
    if (!v) return changeMode('none');
    if (mode === 'datetime') save({ dueAt: localToUtc(v, time, ctx.timezone), dueDate: null });
    else save({ dueDate: v, dueAt: null });
  }

  const rec = task.recurrence;
  const saveRec = (next: Recurrence | null) => save({ recurrence: next });

  return (
    <div className="space-y-4">
      <DraftField
        id="d-title"
        label={t('detail.titleLabel')}
        value={task.title}
        onCommit={(title) => title.trim() && save({ title })}
      />
      <DraftField
        id="d-desc"
        label={t('detail.description')}
        value={task.description}
        multiline
        onCommit={(description) => save({ description })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field id="d-status" label={t('detail.status')}>
          <Select
            value={task.status}
            onValueChange={(status) =>
              setStatus.mutate({ id: task.id, status: status as TaskStatus })
            }
          >
            <SelectTrigger id="d-status" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}` as TKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="d-priority" label={t('detail.priority')}>
          <Select value={task.priority} onValueChange={(p) => save({ priority: p as Priority })}>
            <SelectTrigger id="d-priority" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`priority.${p}` as TKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t('detail.due')}</legend>
        <Select value={mode} onValueChange={(m) => changeMode(m as DueMode)}>
          <SelectTrigger aria-label={t('detail.due')} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('detail.due.none')}</SelectItem>
            <SelectItem value="date">{t('detail.due.date')}</SelectItem>
            <SelectItem value="datetime">{t('detail.due.datetime')}</SelectItem>
          </SelectContent>
        </Select>
        {mode !== 'none' && (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <OptionalDate
                value={day}
                onChange={changeDay}
                ctx={ctx}
                label={t('detail.dueDate')}
              />
            </div>
            {mode === 'datetime' && (
              <Input
                type="time"
                aria-label={t('detail.time')}
                value={time}
                onChange={(e) =>
                  e.target.value &&
                  day &&
                  save({ dueAt: localToUtc(day, e.target.value, ctx.timezone), dueDate: null })
                }
                className="w-28"
              />
            )}
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field id="d-start" label={t('detail.start')}>
          <OptionalDate
            value={task.startDate}
            onChange={(startDate) => save({ startDate })}
            ctx={ctx}
            label={t('detail.start')}
          />
        </Field>
        <EstimateField
          value={task.estimatedMinutes}
          onCommit={(estimatedMinutes) => save({ estimatedMinutes })}
        />
      </div>

      <Field id="d-area" label={t('detail.area')}>
        <Select
          value={task.areaId ?? NO_AREA}
          onValueChange={(v) => save({ areaId: v === NO_AREA ? null : v })}
        >
          <SelectTrigger id="d-area" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_AREA}>{t('detail.noArea')}</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <fieldset className="space-y-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">{t('detail.repeat')}</legend>
        <Select
          value={rec?.frequency ?? 'none'}
          onValueChange={(v) =>
            saveRec(
              v === 'none' ? null : { frequency: v as Frequency, interval: rec?.interval ?? 1 },
            )
          }
        >
          <SelectTrigger aria-label={t('detail.repeat')} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('detail.repeat.none')}</SelectItem>
            {FREQS.map((f) => (
              <SelectItem key={f} value={f}>
                {t(`detail.repeat.${f}` as TKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rec && (
          <div className="flex items-center gap-2">
            <Label htmlFor="d-interval">{t('detail.every')}</Label>
            <Input
              id="d-interval"
              type="number"
              min={1}
              value={rec.interval}
              onChange={(e) => {
                const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                saveRec({ ...rec, interval: n });
              }}
              className="w-20"
            />
          </div>
        )}
        {rec?.frequency === 'Weekly' && (
          <div role="group" aria-label={t('detail.weekdays')} className="flex flex-wrap gap-1">
            {WEEKDAYS.map((w) => {
              const on = rec.byWeekday?.includes(w) ?? false;
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const cur = rec.byWeekday ?? [];
                    const next = on ? cur.filter((x) => x !== w) : [...cur, w];
                    const { byWeekday: _drop, ...rest } = rec;
                    void _drop;
                    saveRec(next.length ? { ...rest, byWeekday: next } : rest);
                  }}
                  className={cn(
                    'h-8 min-w-9 rounded-md border px-2 text-xs',
                    on ? 'border-primary bg-primary text-primary-fg' : 'border-border',
                  )}
                >
                  {t(`detail.weekday.${w}` as TKey)}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <Field id="d-tags" label={t('detail.tags')}>
        <TagPicker id="d-tags" value={task.tagIds} onChange={(ids) => setTags.mutate(ids)} />
      </Field>

      <section aria-labelledby="d-checklist" className="space-y-2">
        <h3 id="d-checklist" className="text-sm font-medium">
          {t('detail.checklist')}
        </h3>
        <Checklist taskId={task.id} items={checklist} />
      </section>

      <dl className="space-y-0.5 border-t border-border pt-3 text-xs text-muted">
        <div className="flex gap-2">
          <dt>{t('detail.created')}:</dt>
          <dd className="tabular-nums">
            {formatDateTime(task.createdAt, ctx.dateFormat, ctx.timezone)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>{t('detail.updated')}:</dt>
          <dd className="tabular-nums">
            {formatDateTime(task.updatedAt, ctx.dateFormat, ctx.timezone)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function EstimateField({
  value,
  onCommit,
}: {
  value: number | undefined;
  onCommit: (v: number | null) => void;
}) {
  const t = useT();
  const [text, setText] = useState(value?.toString() ?? '');
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value?.toString() ?? '');
  }
  return (
    <Field id="d-estimate" label={t('detail.estimate')}>
      <Input
        id="d-estimate"
        type="number"
        min={1}
        max={10080}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = text.trim() === '' ? null : Number(text);
          if (n !== (value ?? null)) onCommit(n);
        }}
      />
    </Field>
  );
}

/** Panel chi tiết bên phải; `Esc` đóng. */
export function TaskDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const ctx = useDateCtx();
  const { data, isLoading, error, refetch } = useTask(id);
  return (
    <aside
      aria-label={t('detail.title')}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) onClose();
      }}
      className="flex w-[26rem] shrink-0 flex-col border-l border-border bg-bg"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="font-semibold">{t('detail.title')}</h2>
        <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <LoadingBlock label={t('common.loading')} rows={5} />
        ) : error || !data ? (
          <ErrorState
            title={t('detail.loadError')}
            message={errorMessage(error)}
            retryLabel={t('common.retry')}
            onRetry={() => void refetch()}
          />
        ) : (
          <PanelBody key={data.task.id} detail={data} ctx={ctx} />
        )}
      </div>
    </aside>
  );
}
