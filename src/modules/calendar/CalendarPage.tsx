import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import luxon3Plugin from '@fullcalendar/luxon3';
import viLocale from '@fullcalendar/core/locales/vi';
import type { DatesSetArg, EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core';
import type { DateSelectArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Kbd } from '@/components/ui/kbd';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';
import type { CalendarItem, Task } from '@/lib/ipc/contract';
import { addDays, localToUtc, todayIn, utcToLocalParts } from '@/lib/tz';
import { cn } from '@/lib/utils';
import { useSettings } from '@/modules/settings/hooks';
import { dueDay } from '@/modules/tasks/dates';
import { useDateCtx, useTasks } from '@/modules/tasks/hooks';
import { TaskDetailPanel } from '@/modules/tasks/TaskDetailPanel';
import { CreateEventDialog, ScheduleDialog } from './EventDialogs';
import { EventPanel } from './EventPanel';
import {
  useCalendarRange,
  useCalendars,
  useMoveDeadline,
  useScheduleBlock,
  useUpdateEvent,
  type Range,
} from './hooks';
import {
  blockRangeFromDrop,
  deadlinePatchFromFc,
  eventPatchFromFc,
  FC_VIEW,
  rangeFromFc,
  toFcEvent,
  unscheduledTasks,
  viewFromFc,
  VIEWS,
  type CalendarView,
  type EventParts,
} from './mapping';
import { UnscheduledList } from './UnscheduledList';

// Mảng phải là hằng: FullCalendar so sánh theo tham chiếu, mảng mới mỗi lần render sẽ làm nó đặt lại và phát `datesSet` liên tục.
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxon3Plugin];
const LOCALES = [viLocale];
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
const FIRST_DAY = { Mon: 1, Sun: 0, Sat: 6 } as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Hàm có tham chiếu cố định nhưng luôn gọi bản mới nhất: FullCalendar đặt lại khi prop đổi tham chiếu. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useStable<A extends any[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

function markEl(arg: { el: HTMLElement; event: { title: string; extendedProps: object } }) {
  arg.el.setAttribute('title', arg.event.title);
  arg.el.dataset.kind = (arg.event.extendedProps as { kind: string }).kind;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function partsFromSelect(arg: DateSelectArg, timeZone: string): EventParts {
  if (arg.allDay)
    return {
      isAllDay: true,
      startDate: arg.startStr.slice(0, 10),
      startTime: '09:00',
      endDate: addDays(arg.endStr.slice(0, 10), -1),
      endTime: '10:00',
    };
  const s = utcToLocalParts(new Date(arg.startStr).toISOString(), timeZone);
  const e = utcToLocalParts(new Date(arg.endStr).toISOString(), timeZone);
  return {
    isAllDay: false,
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
  };
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const svg = (label: string, body: string) =>
  `<svg class="lh-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${esc(label)}">${body}</svg>`;
const FLAG =
  '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>';
const LINK =
  '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>';

/**
 * Một mục trong lịch: Event (có thể là time block) hoặc deadline — khác nhau cả biểu tượng lẫn chữ.
 * Trả về `{ html }` (đã escape) thay vì JSX: FullCalendar render JSX bằng flushSync trong lifecycle, React 19 báo lỗi console.
 */
function renderItem(arg: EventContentArg, t: ReturnType<typeof useT>) {
  const props = arg.event.extendedProps as Partial<{
    kind: 'Event' | 'Deadline';
    item: CalendarItem;
  }>;
  const title = esc(arg.event.title);
  // Bản xem trước khi kéo/chọn (mirror) không mang dữ liệu của mình.
  if (!props.item) return { html: `<span>${title}</span>` };
  if (props.item.kind === 'Deadline') {
    const done = props.item.task.status === 'Done';
    const text = `${esc(t('cal.deadlinePrefix'))}: ${title}`;
    return {
      html: `<span class="lh-row">${svg(t('cal.deadlinePrefix'), FLAG)}<span class="lh-grow${done ? ' lh-strike' : ''}">${text}</span>${done ? `<span class="sr-only">${esc(t('status.Done'))}</span>` : ''}</span>`,
    };
  }
  // Chỉ hiện giờ bắt đầu: ô sự kiện ngắn không đủ chỗ cho "09:30 - 10:00".
  const start = arg.view.type.startsWith('list') ? '' : (arg.timeText.split(/\s[-–]\s/)[0] ?? '');
  const time = start ? `<span class="lh-time">${esc(start)}</span>` : '';
  const icon = props.item.event.taskId ? svg(t('cal.blockOf'), LINK) : '';
  return { html: `<span class="lh-block-text">${icon}${time}<span>${title}</span></span>` };
}

export function CalendarPage() {
  const t = useT();
  const ctx = useDateCtx();
  const { data: settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const calRef = useRef<FullCalendar>(null);
  const timezone = ctx.timezone;

  const rawView = params.get('view');
  const view: CalendarView = VIEWS.find((v) => v === rawView) ?? 'week';
  const rawDate = params.get('date');
  const date = rawDate && YMD.test(rawDate) ? rawDate : undefined;
  const eventId = params.get('event') ?? undefined;
  const taskId = params.get('task') ?? undefined;

  const [range, setRange] = useState<Range>();
  const [title, setTitle] = useState('');
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [createInit, setCreateInit] = useState<{ open: boolean; parts?: EventParts }>({
    open: false,
  });
  const [scheduling, setScheduling] = useState<Task>();

  const { data: items, isLoading, error, refetch } = useCalendarRange(range);
  const { data: calendars = [] } = useCalendars();
  const { data: allTasks, isLoading: tasksLoading } = useTasks({});
  const updateEvent = useUpdateEvent({ optimistic: true });
  const moveDeadline = useMoveDeadline();
  const schedule = useScheduleBlock();

  const colorOf = useCallback(
    (id: string) => calendars.find((c) => c.id === id)?.color,
    [calendars],
  );
  const fcEvents = useMemo(() => (items ?? []).map((i) => toFcEvent(i, colorOf)), [items, colorOf]);
  const unscheduled = useMemo(
    () =>
      range && allTasks
        ? unscheduledTasks(allTasks, items ?? [], range, (x) => dueDay(x, timezone))
        : [],
    [allTasks, items, range, timezone],
  );
  const eventItem = useMemo(() => {
    const hit = (items ?? []).find((i) => i.kind === 'Event' && i.event.id === eventId);
    return hit?.kind === 'Event' ? hit.event : undefined;
  }, [items, eventId]);

  const setParam = useCallback(
    (changes: Record<string, string | undefined>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === undefined) next.delete(k);
            else next.set(k, v);
          }
          return next.toString() === prev.toString() ? prev : next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // URL → lịch (đổi chế độ xem, ngày): chỉ chuyển khi khác với trạng thái hiện tại để tránh vòng lặp.
  useEffect(() => {
    const api = calRef.current?.getApi();
    if (!api) return;
    const want = FC_VIEW[view];
    if (api.view.type !== want) api.changeView(want, date);
    else if (date) {
      const at = new Date(localToUtc(date, '12:00', timezone)).getTime();
      if (at < api.view.activeStart.getTime() || at >= api.view.activeEnd.getTime())
        api.gotoDate(date);
    }
  }, [view, date, timezone]);

  // Lịch → URL
  const onDatesSet = useStable((info: DatesSetArg) => {
    const next = rangeFromFc(info.startStr, info.endStr);
    const day = utcToLocalParts(info.view.currentStart.toISOString(), timezone).date;
    const type = viewFromFc(info.view.type);
    const titleText = info.view.title;
    // Hoãn sang tác vụ kế tiếp: đang ở giữa commit của FullCalendar, không đổi state/router ngay.
    setTimeout(() => {
      setRange((prev) => (prev?.from === next.from && prev.to === next.to ? prev : next));
      setTitle(titleText);
      setParam({ view: type, date: day });
    }, 0);
  });

  const api = () => calRef.current?.getApi();
  // Đổi chế độ xem: giữ ngày đang xem; nếu hôm nay nằm trong khoảng đang xem thì lấy hôm nay làm mốc.
  const switchView = (v: CalendarView) => {
    const cal = api();
    const today = todayIn(timezone);
    const noon = new Date(localToUtc(today, '12:00', timezone)).getTime();
    const keep =
      cal && noon >= cal.view.activeStart.getTime() && noon < cal.view.activeEnd.getTime()
        ? today
        : date;
    setParam({ view: v, ...(keep ? { date: keep } : {}) });
  };
  const openCreate = useCallback(
    (parts?: EventParts) => setCreateInit({ open: true, ...(parts ? { parts } : {}) }),
    [],
  );

  // Phím tắt: N tạo sự kiện, T hôm nay, ←/→ kỳ trước/sau.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'n') openCreate();
      else if (k === 't') calRef.current?.getApi().today();
      else if (e.key === 'ArrowLeft') calRef.current?.getApi().prev();
      else if (e.key === 'ArrowRight') calRef.current?.getApi().next();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCreate]);

  const onEventChange = useStable((info: EventDropArg | EventResizeDoneArg) => {
    const { kind, item } = info.event.extendedProps as { kind: string; item: CalendarItem };
    const result = {
      allDay: info.event.allDay,
      startStr: info.event.startStr,
      endStr: info.event.endStr,
    };
    if (kind === 'Event' && item.kind === 'Event')
      updateEvent.mutate(
        { event: item.event, patch: eventPatchFromFc(item.event, result) },
        { onError: () => info.revert() },
      );
    else if (item.kind === 'Deadline')
      moveDeadline.mutate(
        { task: item.task, patch: deadlinePatchFromFc(result) },
        { onError: () => info.revert() },
      );
  });

  const onEventClick = useStable((info: EventClickArg) => {
    const { item } = info.event.extendedProps as { item: CalendarItem };
    if (item.kind === 'Event') setParam({ event: item.event.id, task: undefined });
    else setParam({ task: item.task.id, event: undefined });
  });

  const onExternalDrop = useStable(
    (info: { allDay: boolean; dateStr: string; draggedEl: HTMLElement }) => {
      const id = info.draggedEl.dataset.taskId;
      if (!id) return;
      const task = allTasks?.find((x) => x.id === id);
      const { startAt, endAt } = blockRangeFromDrop(info, task?.estimatedMinutes, timezone);
      schedule.mutate({ taskId: id, startAt, endAt });
    },
  );
  const renderContent = useStable((arg: EventContentArg) => renderItem(arg, t));
  const onSelect = useStable((arg: DateSelectArg) => {
    openCreate(partsFromSelect(arg, timezone));
    calRef.current?.getApi().unselect();
  });
  // initialView/initialDate chỉ dùng lúc khởi tạo: đóng băng để không đổi prop theo URL.
  const [initial] = useState(() => ({ view: FC_VIEW[view], date: date ?? todayIn(timezone) }));

  const header = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <h1 className="mr-2 flex items-center gap-2 text-xl font-semibold">
        <CalendarDays className="size-5 text-muted" aria-hidden />
        {t('nav.calendar')}
      </h1>
      <div className="flex items-center gap-1" role="group" aria-label={t('cal.navigate')}>
        <Button
          variant="secondary"
          size="icon"
          aria-label={t('cal.prev')}
          onClick={() => api()?.prev()}
        >
          <ChevronLeft />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => api()?.today()}>
          {t('cal.today')} <Kbd>T</Kbd>
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={t('cal.next')}
          onClick={() => api()?.next()}
        >
          <ChevronRight />
        </Button>
      </div>
      <h2 aria-live="polite" className="min-w-0 flex-1 truncate text-base font-medium">
        {title}
      </h2>
      <div
        role="group"
        aria-label={t('cal.views')}
        className="flex rounded-md border border-border"
      >
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => switchView(v)}
            className={cn(
              'h-8 px-3 text-sm first:rounded-l-md last:rounded-r-md',
              view === v ? 'bg-primary text-primary-fg' : 'hover:bg-border/60',
            )}
          >
            {t(`cal.view.${v}` as const)}
          </button>
        ))}
      </div>
      <Button size="sm" onClick={() => openCreate()}>
        <Plus />
        {t('cal.create')} <Kbd>N</Kbd>
      </Button>
    </div>
  );

  return (
    <div className="flex h-full min-w-0">
      <UnscheduledList
        tasks={unscheduled}
        loading={tasksLoading}
        collapsed={sideCollapsed}
        onToggle={() => setSideCollapsed((c) => !c)}
        onSchedule={setScheduling}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        {error && !items ? (
          <div className="p-6">
            <ErrorState
              title={t('common.loadError')}
              message={errorMessage(error)}
              retryLabel={t('common.retry')}
              onRetry={() => void refetch()}
            />
          </div>
        ) : null}
        <div
          className={cn('lh-calendar relative min-h-0 flex-1 p-2', error && !items && 'hidden')}
          aria-busy={isLoading}
        >
          {isLoading && (
            <p className="absolute top-3 right-4 z-10 text-xs text-muted">{t('common.loading')}</p>
          )}
          {range && items?.length === 0 && !isLoading && (
            <p className="sr-only" role="status">
              {t('cal.empty')}
            </p>
          )}
          <FullCalendar
            ref={calRef}
            plugins={PLUGINS}
            timeZone={timezone}
            locales={LOCALES}
            locale={ctx.language}
            firstDay={FIRST_DAY[settings?.weekStart ?? 'Mon']}
            initialView={initial.view}
            initialDate={initial.date}
            headerToolbar={false}
            height="100%"
            nowIndicator
            scrollTime="06:00:00"
            slotDuration="00:30:00"
            slotLabelFormat={TIME_FORMAT}
            eventTimeFormat={TIME_FORMAT}
            allDayText={t('cal.allDay')}
            noEventsText={t('cal.empty')}
            dayMaxEvents
            navLinks={false}
            editable
            selectable
            selectMirror
            droppable
            eventStartEditable
            eventDurationEditable
            events={fcEvents}
            eventContent={renderContent}
            datesSet={onDatesSet}
            select={onSelect}
            eventClick={onEventClick}
            eventDrop={onEventChange}
            eventResize={onEventChange}
            drop={onExternalDrop}
            eventDidMount={markEl}
          />
        </div>
      </div>
      {eventItem && (
        <EventPanel
          key={eventItem.id}
          event={eventItem}
          onClose={() => setParam({ event: undefined })}
        />
      )}
      {taskId && (
        <TaskDetailPanel key={taskId} id={taskId} onClose={() => setParam({ task: undefined })} />
      )}
      <CreateEventDialog
        open={createInit.open}
        onOpenChange={(open) => setCreateInit((s) => ({ ...s, open }))}
        initial={createInit.parts}
      />
      <ScheduleDialog task={scheduling} onClose={() => setScheduling(undefined)} />
    </div>
  );
}
