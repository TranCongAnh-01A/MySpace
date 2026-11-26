import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import { errorMessage, taskUpdate } from '@/lib/ipc/commands';
import type { Priority, Task, TaskStatus } from '@/lib/ipc/contract';
import { useArchiveTask, useDeleteTask, useSetStatus } from './hooks';

/** Các thao tác của context menu cho một Task (đổi trạng thái/ưu tiên, lưu trữ, xoá). */
export function useTaskActions(task: Task, onOpen: () => void) {
  const t = useT();
  const qc = useQueryClient();
  const setStatus = useSetStatus();
  const archive = useArchiveTask();
  const remove = useDeleteTask();
  const setPriority = useMutation({
    mutationFn: (p: Priority) => taskUpdate(task.id, { priority: p }, task.version),
    onError: (e) => toast.error(t('detail.saveError'), { description: errorMessage(e) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['task'] });
    },
  });
  return {
    onOpen,
    onStatus: (status: TaskStatus) => setStatus.mutate({ id: task.id, status }),
    onPriority: (p: Priority) => setPriority.mutate(p),
    onArchive: () => archive.mutate({ id: task.id, archive: !task.archivedAt }),
    onDelete: () => remove.mutate(task.id),
  };
}
