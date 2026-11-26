import { useId, useMemo, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { foldText } from '@/lib/format/text';
import { cn } from '@/lib/utils';

export type PickerItem = { id: string; label: string };

/** Popover có ô tìm (không dấu) + listbox; dùng cho "Liên kết Task…", "Liên kết ghi chú…", "Chuyển sang dự án…". */
export function ItemPicker({
  trigger,
  items,
  onPick,
  searchLabel,
  emptyText,
  open: openProp,
  onOpenChange,
}: {
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  items: readonly PickerItem[];
  onPick: (id: string) => void;
  searchLabel: string;
  emptyText: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => {
    setOpenState(o);
    if (o) {
      setQuery('');
      setActive(0);
    }
    onOpenChange?.(o);
  };
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const filtered = useMemo(() => {
    const q = foldText(query).trim();
    return q ? items.filter((i) => foldText(i.label).includes(q)) : items;
  }, [items, query]);
  const current = Math.min(active, Math.max(0, filtered.length - 1));

  const choose = (id: string) => {
    onPick(id);
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery('');
          setActive(0);
        }
      }}
    >
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-72 rounded-md border border-border bg-surface p-1 text-sm text-text shadow-md"
        >
          <input
            autoFocus
            role="searchbox"
            aria-label={searchLabel}
            aria-controls={listId}
            aria-activedescendant={filtered[current] ? `${listId}-${current}` : undefined}
            placeholder={searchLabel}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(Math.min(current + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(Math.max(current - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const it = filtered[current];
                if (it) choose(it.id);
              }
            }}
            className="mb-1 h-8 w-full rounded border border-border bg-bg px-2 text-sm placeholder:text-muted"
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={searchLabel}
            className="max-h-60 overflow-auto"
          >
            {filtered.length === 0 && <li className="px-2 py-2 text-muted">{emptyText}</li>}
            {filtered.map((it, i) => (
              <li
                key={it.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(it.id)}
                className={cn(
                  'cursor-default truncate rounded px-2 py-1.5',
                  i === current && 'bg-border/70',
                )}
              >
                {it.label}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
