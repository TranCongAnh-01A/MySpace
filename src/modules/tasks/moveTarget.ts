import type { TaskStatus } from '@/lib/ipc/contract';

export type Columns = Record<TaskStatus, string[]>;
export const COLUMN_PREFIX = 'col:';
export const columnId = (s: TaskStatus) => `${COLUMN_PREFIX}${s}`;

export type MoveTarget = { status: TaskStatus; beforeId?: string; afterId?: string };

/**
 * Tính đích của một lần kéo thả (hàm thuần, có test).
 * `beforeId` = thẻ nằm ngay trên vị trí mới, `afterId` = thẻ nằm ngay dưới, **trong cột đích**.
 * `overId` là id thẻ đang rê tới, hoặc `col:<status>` khi thả vào vùng trống của cột (xuống cuối cột).
 */
export function computeMoveTarget(
  columns: Columns,
  activeId: string,
  overId: string,
): MoveTarget | null {
  if (activeId === overId) return null;
  let status: TaskStatus | undefined;
  if (overId.startsWith(COLUMN_PREFIX)) {
    status = overId.slice(COLUMN_PREFIX.length) as TaskStatus;
  } else {
    for (const s of Object.keys(columns) as TaskStatus[]) {
      if (columns[s].includes(overId)) status = s;
    }
  }
  if (!status) return null;
  const fromStatus = (Object.keys(columns) as TaskStatus[]).find((s) =>
    columns[s].includes(activeId),
  );
  const rest = columns[status].filter((id) => id !== activeId);
  const result = (before?: string, after?: string): MoveTarget => ({
    status,
    ...(before ? { beforeId: before } : {}),
    ...(after ? { afterId: after } : {}),
  });

  if (overId.startsWith(COLUMN_PREFIX)) return result(rest[rest.length - 1], undefined);

  const overIndex = rest.indexOf(overId);
  const original = columns[status];
  const movingDown = fromStatus === status && original.indexOf(activeId) < original.indexOf(overId);
  if (movingDown) return result(overId, rest[overIndex + 1]);
  return result(rest[overIndex - 1], overId);
}
