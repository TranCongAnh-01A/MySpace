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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Layers, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { LoadingBlock } from '@/components/ui/skeleton';
import {
  areaCreate,
  areaDelete,
  areaList,
  areaReorder,
  areaUpdate,
  errorMessage,
} from '@/lib/ipc/commands';
import type { Area } from '@/lib/ipc/contract';
import { useT } from '@/lib/i18n';
import { AREA_COLORS } from './areaColors';

const AREAS_KEY = ['areas'] as const;

function ColorDot({ color, className = '' }: { color?: string | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-4 rounded-full border border-border ${className}`}
      style={{ background: color ?? 'transparent' }}
    />
  );
}

function AreaRow({ area, onError }: { area: Area; onError: (e: unknown) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: area.id });
  const [name, setName] = useState(area.name);
  const [prevName, setPrevName] = useState(area.name);
  if (area.name !== prevName) {
    // Tên đổi từ bên ngoài (event/invalidate): đồng bộ lại ô nhập.
    setPrevName(area.name);
    setName(area.name);
  }

  const update = useMutation({
    mutationFn: (patch: { name?: string; color?: string }) => areaUpdate(area.id, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: AREAS_KEY }),
    onError: (e) => {
      setName(area.name);
      onError(e);
    },
  });
  const remove = useMutation({
    mutationFn: () => areaDelete(area.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: AREAS_KEY }),
    onError: onError,
  });

  function commitName() {
    const next = name.trim();
    if (next === area.name) return;
    if (!next) {
      setName(area.name);
      return;
    }
    update.mutate({ name: next });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border border-border bg-surface p-2 ${isDragging ? 'z-10 shadow-lg' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t('areas.drag', { name: area.name })}
        className="cursor-grab touch-none rounded p-1 text-muted hover:text-text"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${t('areas.color')}: ${area.name}`}>
            <ColorDot color={area.color} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {AREA_COLORS.map((c) => (
            <DropdownMenuItem
              key={c.hex}
              aria-label={t('areas.colorOption', { name: t(c.name) })}
              onSelect={() => update.mutate({ color: c.hex })}
              className="justify-start gap-2"
            >
              <ColorDot color={c.hex} />
              {t(c.name)}
              {c.hex === area.color && <span aria-hidden>✓</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() => update.mutate({ color: '' })}
            className="justify-start gap-2"
          >
            <ColorDot />
            {t('areas.noColor')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        aria-label={t('areas.rename')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            setName(area.name);
            e.currentTarget.blur();
          }
        }}
        className="flex-1"
      />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('areas.delete', { name: area.name })}>
            <Trash2 />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>{t('areas.deleteTitle', { name: area.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t('areas.deleteDesc')}</AlertDialogDescription>
          <DialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction danger onClick={() => remove.mutate()}>
              {t('common.delete')}
            </AlertDialogAction>
          </DialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function AreasTab() {
  const t = useT();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: AREAS_KEY, queryFn: areaList });

  const toastError = (e: unknown) =>
    toast.error(t('common.error'), { description: errorMessage(e) });

  const create = useMutation({
    mutationFn: () => areaCreate({ name: newName }),
    onSuccess: () => {
      setNewName('');
      void qc.invalidateQueries({ queryKey: AREAS_KEY });
    },
  });

  const reorder = useMutation({
    mutationFn: (v: { id: string; beforeId?: string; afterId?: string; next: Area[] }) =>
      areaReorder(v.id, v.beforeId, v.afterId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: AREAS_KEY });
      const previous = qc.getQueryData<Area[]>(AREAS_KEY);
      qc.setQueryData(AREAS_KEY, v.next);
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(AREAS_KEY, ctx.previous);
      toastError(e);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: AREAS_KEY }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!data || !over || active.id === over.id) return;
    const from = data.findIndex((a) => a.id === active.id);
    const to = data.findIndex((a) => a.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(data, from, to);
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
    create.mutate();
  }

  let body;
  if (isLoading) body = <LoadingBlock label={t('common.loading')} />;
  else if (error)
    body = (
      <ErrorState
        title={t('common.loadError')}
        message={errorMessage(error)}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  else if (!data || data.length === 0)
    body = <EmptyState icon={<Layers />} title={t('areas.empty')} hint={t('areas.emptyHint')} />;
  else
    body = (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: t('areas.hint') } }}
      >
        <SortableContext items={data.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {data.map((a) => (
              <AreaRow key={a.id} area={a} onError={toastError} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    );

  return (
    <Card>
      <p className="mb-3 text-muted">{t('areas.hint')}</p>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <Input
          aria-label={t('areas.newLabel')}
          placeholder={t('areas.newPlaceholder')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-invalid={create.isError}
          className="flex-1"
        />
        <Button type="submit" disabled={create.isPending}>
          {t('common.add')}
        </Button>
      </form>
      {create.isError && (
        <p role="alert" className="mb-3 text-danger">
          {errorMessage(create.error)}
        </p>
      )}
      {body}
    </Card>
  );
}
