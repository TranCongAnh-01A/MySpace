import { useState, type FormEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, GripVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';
import {
  checklistAdd,
  checklistDelete,
  checklistReorder,
  checklistToggle,
  checklistUpdate,
  errorMessage,
} from '@/lib/ipc/commands';
import type { ChecklistItem, TaskDetail } from '@/lib/ipc/contract';
import { cn } from '@/lib/utils';

function Row({
  item,
  onToggle,
  onRename,
  onDelete,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onRename: (content: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: item.id });
  const [text, setText] = useState(item.content);
  const [prev, setPrev] = useState(item.content);
  if (item.content !== prev) {
    setPrev(item.content);
    setText(item.content);
  }
  const commit = () => {
    const next = text.trim();
    if (next && next !== item.content) onRename(next);
    else setText(item.content);
  };
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-md border border-border bg-surface p-1.5"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t('detail.checklistDrag', { name: item.content })}
        className="cursor-grab touch-none rounded p-0.5 text-muted hover:text-text"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={item.isDone}
        aria-label={item.content}
        onClick={onToggle}
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded border border-muted',
          item.isDone && 'border-success bg-success text-bg',
        )}
      >
        {item.isDone && <Check className="size-3.5" aria-hidden />}
      </button>
      <Input
        aria-label={t('detail.checklistItem')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            e.stopPropagation();
            setText(item.content);
            e.currentTarget.blur();
          }
        }}
        className={cn(
          'h-8 flex-1 border-transparent bg-transparent',
          item.isDone && 'text-muted line-through',
        )}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('detail.checklistDelete', { name: item.content })}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

export function Checklist({ taskId, items }: { taskId: string; items: ChecklistItem[] }) {
  const t = useT();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const key = ['task', taskId] as const;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  };
  const onError = (e: unknown) => toast.error(t('common.error'), { description: errorMessage(e) });

  const add = useMutation({
    mutationFn: (content: string) => checklistAdd(taskId, content),
    onSuccess: () => setText(''),
    onError,
    onSettled: refresh,
  });
  const toggle = useMutation({
    mutationFn: (id: string) => checklistToggle(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TaskDetail>(key);
      qc.setQueryData<TaskDetail>(key, (d) =>
        d
          ? {
              ...d,
              checklist: d.checklist.map((c) => (c.id === id ? { ...c, isDone: !c.isDone } : c)),
            }
          : d,
      );
      return { previous };
    },
    onError: (e, _id, c) => {
      if (c?.previous) qc.setQueryData(key, c.previous);
      onError(e);
    },
    onSettled: refresh,
  });
  const rename = useMutation({
    mutationFn: (v: { id: string; content: string }) => checklistUpdate(v.id, v.content),
    onError,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => checklistDelete(id),
    onError,
    onSettled: refresh,
  });
  const reorder = useMutation({
    mutationFn: (v: { id: string; beforeId?: string; afterId?: string; next: ChecklistItem[] }) =>
      checklistReorder(v.id, v.beforeId, v.afterId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TaskDetail>(key);
      qc.setQueryData<TaskDetail>(key, (d) => (d ? { ...d, checklist: v.next } : d));
      return { previous };
    },
    onError: (e, _v, c) => {
      if (c?.previous) qc.setQueryData(key, c.previous);
      onError(e);
    },
    onSettled: refresh,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    const above = next[to - 1];
    const below = next[to + 1];
    reorder.mutate({
      id: String(active.id),
      ...(above ? { beforeId: above.id } : {}),
      ...(below ? { afterId: below.id } : {}),
      next,
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) add.mutate(text);
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {items.map((i) => (
              <Row
                key={i.id}
                item={i}
                onToggle={() => toggle.mutate(i.id)}
                onRename={(content) => rename.mutate({ id: i.id, content })}
                onDelete={() => remove.mutate(i.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form onSubmit={submit}>
        <Input
          aria-label={t('detail.checklistAdd')}
          placeholder={t('detail.checklistAdd')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
    </div>
  );
}
