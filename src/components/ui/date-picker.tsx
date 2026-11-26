import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { enUS, vi } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import type { DateFormat, Language, WeekStart } from '@/lib/ipc/contract';
import { formatDate } from '@/lib/format/date';
import { cn } from '@/lib/utils';

type Props = {
  value?: Date | undefined;
  onChange: (date: Date | undefined) => void;
  language: Language;
  dateFormat: DateFormat;
  weekStart?: WeekStart;
  placeholder: string;
  ariaLabel?: string;
  className?: string;
};

export function DatePicker({
  value,
  onChange,
  language,
  dateFormat,
  weekStart = 'Mon',
  placeholder,
  ariaLabel,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-9 min-w-44 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm',
          !value && 'text-muted',
          className,
        )}
      >
        <CalendarDays className="size-4 shrink-0" />
        {value ? formatDate(value, dateFormat) : placeholder}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 rounded-md border border-border bg-surface p-3 text-text shadow-md"
        >
          <DayPicker
            mode="single"
            selected={value}
            defaultMonth={value}
            onSelect={(d) => {
              onChange(d);
              setOpen(false);
            }}
            locale={language === 'vi' ? vi : enUS}
            weekStartsOn={weekStart === 'Mon' ? 1 : 0}
            classNames={{
              root: 'text-sm',
              months: 'relative',
              month_caption: 'flex h-8 items-center justify-center font-medium',
              nav: 'absolute inset-x-0 top-0 flex h-8 items-center justify-between',
              button_previous: 'rounded p-1 hover:bg-border/70',
              button_next: 'rounded p-1 hover:bg-border/70',
              weekday: 'size-9 text-xs font-normal text-muted',
              day: 'size-9 p-0 text-center',
              day_button: 'size-9 rounded-md hover:bg-border/70',
              selected: '[&>button]:bg-primary [&>button]:text-primary-fg',
              today: 'font-bold text-primary',
              outside: 'text-muted opacity-60',
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
