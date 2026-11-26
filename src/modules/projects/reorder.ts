import { arrayMove } from '@dnd-kit/sortable';

export type ReorderTarget<T extends { id: string }> = {
  next: T[];
  beforeId?: string;
  afterId?: string;
};

/** Thứ tự mới sau khi kéo `activeId` tới vị trí của `overId`, kèm Project nằm ngay trên/dưới để gọi `projectReorder`. */
export function computeReorder<T extends { id: string }>(
  items: T[],
  activeId: string,
  overId: string,
): ReorderTarget<T> | null {
  const from = items.findIndex((x) => x.id === activeId);
  const to = items.findIndex((x) => x.id === overId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = arrayMove(items, from, to);
  const at = next.findIndex((x) => x.id === activeId);
  const before = next[at - 1]?.id;
  const after = next[at + 1]?.id;
  return {
    next,
    ...(before ? { beforeId: before } : {}),
    ...(after ? { afterId: after } : {}),
  };
}
