import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { errorMessage, tagCreate } from '@/lib/ipc/commands';
import type { Tag } from '@/lib/ipc/contract';
import { cn } from '@/lib/utils';
import { useTags } from './hooks';

/** Chọn nhiều tag; gõ tên chưa có thì tạo mới qua `tagCreate`. */
export function TagPicker({
  value,
  onChange,
  id,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  id?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: tags = [] } = useTags();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (name: string) => tagCreate({ name }),
    onSuccess: (tag) => {
      void qc.invalidateQueries({ queryKey: ['tags'] });
      onChange([...value, tag.id]);
      setQuery('');
    },
    onError: (e) => toast.error(t('common.error'), { description: errorMessage(e) }),
  });

  const q = query.trim().toLowerCase();
  const filtered = q ? tags.filter((x) => x.name.toLowerCase().includes(q)) : tags;
  const exact = tags.some((x) => x.name.toLowerCase() === q);
  const toggle = (tag: Tag) =>
    onChange(value.includes(tag.id) ? value.filter((x) => x !== tag.id) : [...value, tag.id]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((tid) => {
        const tag = tags.find((x) => x.id === tid);
        return tag ? (
          <Badge key={tid} className="gap-1 pr-1">
            {tag.name}
            <button
              type="button"
              aria-label={`${t('ctx.delete')}: ${tag.name}`}
              onClick={() => onChange(value.filter((x) => x !== tid))}
              className="rounded hover:text-text"
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ) : null;
      })}
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setQuery('');
        }}
      >
        <Popover.Trigger asChild>
          <Button id={id} variant="secondary" size="sm" className="h-7">
            <Plus />
            {t('detail.tagAdd')}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-64 rounded-md border border-border bg-surface p-1 text-text shadow-md"
          >
            <input
              autoFocus
              autoComplete="off"
              aria-label={t('detail.tagSearch')}
              placeholder={t('detail.tagSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && q && !exact) {
                  e.preventDefault();
                  create.mutate(query.trim());
                }
              }}
              className="mb-1 h-8 w-full rounded border border-border bg-bg px-2 text-sm placeholder:text-muted"
            />
            <ul className="max-h-48 overflow-auto">
              {filtered.map((tag) => {
                const on = value.includes(tag.id);
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(tag)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-border/70',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 items-center justify-center rounded border border-muted text-xs',
                          on && 'border-primary bg-primary text-primary-fg',
                        )}
                      >
                        {on && '✓'}
                      </span>
                      {tag.name}
                    </button>
                  </li>
                );
              })}
              {q && !exact && (
                <li>
                  <button
                    type="button"
                    onClick={() => create.mutate(query.trim())}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-border/70"
                  >
                    <Plus className="size-4" aria-hidden />
                    {t('detail.tagCreate', { name: query.trim() })}
                  </button>
                </li>
              )}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
