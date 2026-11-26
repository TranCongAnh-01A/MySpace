import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import {
  areaList,
  errorCode,
  errorMessage,
  taskArchive,
  taskCreate,
  taskDelete,
  taskGet,
  taskList,
  taskMove,
  taskSetStatus,
  taskUnarchive,
  tagList,
  trashRestore,
} from '@/lib/ipc/commands';
import type {
  Task,
  TaskCreate,
  TaskFilter,
  TaskStatus,
  TaskStatusResult,
  TodayView,
} from '@/lib/ipc/contract';
import { useLanguage } from '@/lib/i18n';
import { useSettings } from '@/modules/settings/hooks';
import { dayLabel, dueDay, type DateCtx } from './dates';

/** Task đổi thì Today và tiến độ Project cũng đổi. */
export function invalidateTaskData(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['tasks'] });
  void qc.invalidateQueries({ queryKey: ['task'] });
  void qc.invalidateQueries({ queryKey: ['today'] });
  void qc.invalidateQueries({ queryKey: ['project'] });
}

export const tasksKey = (filter: TaskFilter) => ['tasks', filter] as const;

export function useTasks(filter: TaskFilter) {
  return useQuery({ queryKey: tasksKey(filter), queryFn: () => taskList(filter) });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => taskGet(id ?? ''),
    enabled: !!id,
  });
}

export const useTags = () => useQuery({ queryKey: ['tags'], queryFn: tagList });
export const useAreas = () => useQuery({ queryKey: ['areas'], queryFn: areaList });

/** Ngữ cảnh định dạng ngày (ngôn ngữ + định dạng + múi giờ từ Settings). */
export function useDateCtx(): DateCtx {
  const { data } = useSettings();
  const language = useLanguage();
  return {
    language,
    dateFormat: data?.dateFormat ?? 'DD/MM/YYYY',
    timezone: data?.timezone ?? 'Asia/Ho_Chi_Minh',
  };
}

type TasksCache = [readonly unknown[], Task[] | undefined][];

/** Toast + rollback chung cho lỗi của mutation Task. */
function useTaskError() {
  const t = useT();
  return (e: unknown) => {
    if (errorCode(e) === 'CONFLICT') toast.error(t('tasks.conflict'));
    else toast.error(t('common.error'), { description: errorMessage(e) });
  };
}

export function useSetStatus() {
  const qc = useQueryClient();
  const t = useT();
  const ctx = useDateCtx();
  const onError = useTaskError();
  return useMutation({
    mutationFn: (v: { id: string; status: TaskStatus }) => taskSetStatus(v.id, v.status),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      await qc.cancelQueries({ queryKey: ['today'] });
      const previous = qc.getQueriesData<Task[]>({ queryKey: ['tasks'] });
      const previousToday = qc.getQueriesData<TodayView>({ queryKey: ['today'] });
      qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((x) => (x.id === v.id ? { ...x, status: v.status } : x)),
      );
      // Today chỉ liệt kê việc chưa Done: đánh Done thì bỏ ngay khỏi các widget (optimistic).
      if (v.status === 'Done')
        qc.setQueriesData<TodayView>({ queryKey: ['today'] }, (old) =>
          old
            ? {
                ...old,
                today: old.today.filter((x) => x.id !== v.id),
                overdue: old.overdue.filter((x) => x.id !== v.id),
                upcoming: old.upcoming.filter((x) => x.id !== v.id),
              }
            : old,
        );
      return { previous, previousToday };
    },
    onError: (e, _v, c) => {
      c?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      c?.previousToday.forEach(([key, data]) => qc.setQueryData(key, data));
      onError(e);
    },
    onSuccess: (res: TaskStatusResult) => {
      if (res.next) {
        const day = dueDay(res.next, ctx.timezone);
        toast.success(t('tasks.nextCreated', { date: day ? dayLabel(day, ctx, t) : '' }));
      }
    },
    onSettled: () => invalidateTaskData(qc),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  const onError = useTaskError();
  return useMutation({
    mutationFn: (v: { id: string; status: TaskStatus; beforeId?: string; afterId?: string }) =>
      taskMove(v.id, v.status, v.beforeId, v.afterId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previous: TasksCache = qc.getQueriesData<Task[]>({ queryKey: ['tasks'] });
      qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return old;
        const moving = old.find((x) => x.id === v.id);
        if (!moving) return old;
        const rest = old.filter((x) => x.id !== v.id);
        const updated = { ...moving, status: v.status };
        const idxOf = (id?: string) => (id ? rest.findIndex((x) => x.id === id) : -1);
        const b = idxOf(v.beforeId);
        const a = idxOf(v.afterId);
        const at = b >= 0 ? b + 1 : a >= 0 ? a : rest.length;
        return [...rest.slice(0, at), updated, ...rest.slice(at)];
      });
      return { previous };
    },
    onError: (e, _v, c) => {
      c?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      onError(e);
    },
    onSettled: () => invalidateTaskData(qc),
  });
}

/** Xoá mềm kèm toast hoàn tác 5 giây (gọi `trash_restore`). */
export function useDeleteTask() {
  const qc = useQueryClient();
  const t = useT();
  const onError = useTaskError();
  return useMutation({
    mutationFn: (id: string) => taskDelete(id),
    onSuccess: (_r, id) => {
      toast(t('tasks.deleted'), {
        duration: 5000,
        action: {
          label: t('tasks.undo'),
          onClick: () => {
            void trashRestore('Task', id)
              .then(() => invalidateTaskData(qc))
              .catch(onError);
          },
        },
      });
    },
    onError,
    onSettled: () => {
      invalidateTaskData(qc);
      void qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  const t = useT();
  const onError = useTaskError();
  return useMutation({
    mutationFn: (v: { id: string; archive: boolean }) =>
      v.archive ? taskArchive(v.id) : taskUnarchive(v.id),
    onSuccess: (_r, v) => {
      if (v.archive) toast(t('tasks.archived'));
    },
    onError,
    onSettled: () => invalidateTaskData(qc),
  });
}

export function useCreateTask(onCreated?: (task: Task) => void) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (input: TaskCreate) => taskCreate(input),
    onSuccess: (task) => {
      toast.success(t('tasks.createdToast'));
      invalidateTaskData(qc);
      onCreated?.(task);
    },
  });
}
