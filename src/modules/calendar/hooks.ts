import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import {
  calendarList,
  calendarRange,
  errorCode,
  errorMessage,
  eventCreate,
  eventDelete,
  eventUpdate,
  taskScheduleBlock,
  taskUpdate,
} from '@/lib/ipc/commands';
import type { CalendarItem, Event, EventCreate, EventPatch, TaskPatch } from '@/lib/ipc/contract';
import { applyDuePatch, applyEventPatch } from './mapping';

export type Range = { from: string; to: string };

export function useCalendarRange(range: Range | undefined) {
  return useQuery({
    queryKey: ['calendar', range?.from, range?.to],
    queryFn: () => calendarRange(range?.from ?? '', range?.to ?? ''),
    enabled: !!range,
    placeholderData: keepPreviousData,
  });
}

export const useCalendars = () => useQuery({ queryKey: ['calendars'], queryFn: calendarList });

type Qc = ReturnType<typeof useQueryClient>;
/** Event / Task đổi thì lịch, Today, nhắc nhở và danh sách Task cùng đổi. */
export function invalidateCalendarData(qc: Qc) {
  for (const key of ['calendar', 'today', 'reminders', 'tasks', 'task'])
    void qc.invalidateQueries({ queryKey: [key] });
}

function useCalendarError() {
  const t = useT();
  return (e: unknown) => {
    if (errorCode(e) === 'CONFLICT') toast.error(t('cal.conflict'));
    else toast.error(t('common.error'), { description: errorMessage(e) });
  };
}

type Snapshot = [readonly unknown[], CalendarItem[] | undefined][];

async function patchCache(qc: Qc, map: (items: CalendarItem[]) => CalendarItem[]) {
  await qc.cancelQueries({ queryKey: ['calendar'] });
  const previous: Snapshot = qc.getQueriesData<CalendarItem[]>({ queryKey: ['calendar'] });
  qc.setQueriesData<CalendarItem[]>({ queryKey: ['calendar'] }, (old) => old && map(old));
  return previous;
}
const rollback = (qc: Qc, previous: Snapshot | undefined) =>
  previous?.forEach(([key, data]) => qc.setQueryData(key, data));

export function useCreateEvent(onDone?: (e: Event) => void) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (input: EventCreate) => eventCreate(input),
    onSuccess: (e) => {
      toast.success(t('cal.created'));
      onDone?.(e);
    },
    onSettled: () => invalidateCalendarData(qc),
  });
}

/** Sửa Event; `optimistic` (kéo thả) cập nhật cache ngay và rollback khi lỗi. */
export function useUpdateEvent(opts: { optimistic?: boolean } = {}) {
  const qc = useQueryClient();
  const onError = useCalendarError();
  return useMutation({
    mutationFn: (v: { event: Event; patch: EventPatch }) =>
      eventUpdate(v.event.id, v.patch, v.event.version),
    onMutate: async (v) =>
      opts.optimistic
        ? {
            previous: await patchCache(qc, (items) =>
              items.map((i) =>
                i.kind === 'Event' && i.event.id === v.event.id
                  ? { kind: 'Event', event: applyEventPatch(i.event, v.patch) }
                  : i,
              ),
            ),
          }
        : { previous: undefined },
    onError: (e, _v, c) => {
      rollback(qc, c?.previous);
      onError(e);
    },
    onSettled: () => invalidateCalendarData(qc),
  });
}

export function useDeleteEvent(onDone?: () => void) {
  const qc = useQueryClient();
  const t = useT();
  const onError = useCalendarError();
  return useMutation({
    mutationFn: (id: string) => eventDelete(id),
    onSuccess: () => {
      toast(t('cal.deleted'));
      onDone?.();
    },
    onError,
    onSettled: () => invalidateCalendarData(qc),
  });
}

/** Kéo deadline: đổi hạn của Task. */
export function useMoveDeadline() {
  const qc = useQueryClient();
  const onError = useCalendarError();
  return useMutation({
    mutationFn: (v: { task: { id: string; version: number }; patch: TaskPatch }) =>
      taskUpdate(v.task.id, v.patch, v.task.version),
    onMutate: async (v) => ({
      previous: await patchCache(qc, (items) =>
        items.map((i) =>
          i.kind === 'Deadline' && i.task.id === v.task.id
            ? { kind: 'Deadline', task: applyDuePatch(i.task, v.patch) }
            : i,
        ),
      ),
    }),
    onError: (e, _v, c) => {
      rollback(qc, c?.previous);
      onError(e);
    },
    onSettled: () => invalidateCalendarData(qc),
  });
}

export function useScheduleBlock(onDone?: () => void) {
  const qc = useQueryClient();
  const t = useT();
  const onError = useCalendarError();
  return useMutation({
    mutationFn: (v: { taskId: string; startAt: string; endAt: string }) =>
      taskScheduleBlock(v.taskId, v.startAt, v.endAt),
    onSuccess: () => {
      toast.success(t('cal.blockCreated'));
      onDone?.();
    },
    onError,
    onSettled: () => invalidateCalendarData(qc),
  });
}
