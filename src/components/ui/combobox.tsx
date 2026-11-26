import { useId, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  /** Nhãn cho trình đọc màn hình (trigger đã có label ngoài thì truyền id qua `labelledBy`). */
  ariaLabel?: string;
  labelledBy?: string;
  searchPlaceholder: string;
  emptyText: string;
  id?: string;
};

/** Combobox tìm kiếm: nút mở popover chứa ô lọc + listbox, điều khiển hoàn toàn bằng bàn phím. */
export function Combobox({
  value,
  onChange,
  options,
  ariaLabel,
  labelledBy,
  searchPlaceholder,
  emptyText,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function choose(option: string) {
    onChange(option);
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery('');
          setActive(Math.max(0, options.indexOf(value)));
        }
      }}
    >
      <Popover.Trigger
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        className="inline-flex h-9 min-w-64 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-text"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-72 rounded-md border border-border bg-surface p-1 text-text shadow-md"
        >
          <input
            autoFocus
            role="searchbox"
            aria-controls={listId}
            aria-activedescendant={filtered[active] ? `${listId}-opt-${active}` : undefined}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const option = filtered[active];
                if (option) choose(option);
              }
            }}
            className="mb-1 h-8 w-full rounded border border-border bg-bg px-2 text-sm placeholder:text-muted"
          />
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-auto">
            {filtered.length === 0 && <li className="px-2 py-2 text-muted">{emptyText}</li>}
            {filtered.map((option, i) => (
              <li
                key={option}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={option === value}
                ref={(el) => {
                  if (el && i === active) el.scrollIntoView({ block: 'nearest' });
                }}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
                className={cn(
                  'flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm',
                  i === active && 'bg-border/70',
                )}
              >
                <Check className={cn('size-4 shrink-0', option !== value && 'invisible')} />
                {option}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
