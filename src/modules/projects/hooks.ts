import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import {
  errorCode,
  errorMessage,
  projectArchive,
  projectCreate,
  projectDelete,
  projectGetOverview,
  projectList,
  projectReorder,
  projectUnarchive,
  projectUpdate,
  trashRestore,
} from '@/lib/ipc/commands';
import type {
  ChildMode,
  Project,
  ProjectCreate,
  ProjectOverview,
  ProjectPatch,
} from '@/lib/ipc/contract';

export const projectsKey = (archived: boolean) => ['projects', archived] as const;

export function useProjects(archived = false) {
  return useQuery({
    queryKey: projectsKey(archived),
    queryFn: () => projectList(archived),
  });
}

export function useProjectOverview(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectGetOverview(id ?? ''),
    enabled: !!id,
  });
}

/** Mọi nơi hiển thị Project, tiến độ và Today đều làm mới sau khi Project hoặc Task con đổi. */
export function invalidateProjectData(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['projects'] });
  void qc.invalidateQueries({ queryKey: ['project'] });
  void qc.invalidateQueries({ queryKey: ['tasks'] });
  void qc.invalidateQueries({ queryKey: ['today'] });
  void qc.invalidateQueries({ queryKey: ['trash'] });
}

function useProjectError() {
  const t = useT();
  return (e: unknown) => {
    if (errorCode(e) === 'CONFLICT') toast.error(t('proj.conflict'));
    else toast.error(t('proj.saveError'), { description: errorMessage(e) });
  };
}

export function useCreateProject(onCreated?: (p: Project) => void) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (input: ProjectCreate) => projectCreate(input),
    onSuccess: (p) => {
      toast.success(t('proj.created'));
      onCreated?.(p);
    },
    onSettled: () => invalidateProjectData(qc),
  });
}

/** Sửa Project kèm `baseVersion`; `CONFLICT` thì báo và tải lại (như Task ở C2). */
export function useUpdateProject(project: Project) {
  const qc = useQueryClient();
  const onError = useProjectError();
  return useMutation({
    mutationFn: (patch: ProjectPatch) => projectUpdate(project.id, patch, project.version),
    onSuccess: (saved) => {
      qc.setQueryData<ProjectOverview>(['project', project.id], (o) =>
        o ? { ...o, project: saved } : o,
      );
    },
    onError,
    onSettled: () => invalidateProjectData(qc),
  });
}

export function useReorderProject() {
  const qc = useQueryClient();
  const onError = useProjectError();
  return useMutation({
    mutationFn: (v: { id: string; beforeId?: string; afterId?: string; next: Project[] }) =>
      projectReorder(v.id, v.beforeId, v.afterId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: projectsKey(false) });
      const previous = qc.getQueryData<Project[]>(projectsKey(false));
      qc.setQueryData<Project[]>(projectsKey(false), v.next);
      return { previous };
    },
    onError: (e, _v, c) => {
      qc.setQueryData(projectsKey(false), c?.previous);
      onError(e);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

/** Lưu trữ hoặc xoá Project theo `mode`; xoá thì có toast Hoàn tác (`trash_restore`). */
export function useRetireProject(kind: 'archive' | 'delete', onDone?: () => void) {
  const qc = useQueryClient();
  const t = useT();
  const onError = useProjectError();
  return useMutation({
    mutationFn: (v: { id: string; mode: ChildMode }) =>
      kind === 'archive' ? projectArchive(v.id, v.mode) : projectDelete(v.id, v.mode),
    onSuccess: (_r, v) => {
      if (kind === 'archive') toast(t('proj.archived'));
      else
        toast(t('proj.deleted'), {
          duration: 6000,
          action: {
            label: t('tasks.undo'),
            onClick: () => {
              void trashRestore('Project', v.id)
                .then(() => invalidateProjectData(qc))
                .catch(onError);
            },
          },
        });
      onDone?.();
    },
    onError,
    onSettled: () => invalidateProjectData(qc),
  });
}

export function useUnarchiveProject() {
  const qc = useQueryClient();
  const t = useT();
  const onError = useProjectError();
  return useMutation({
    mutationFn: (id: string) => projectUnarchive(id),
    onSuccess: () => toast.success(t('proj.unarchived')),
    onError,
    onSettled: () => invalidateProjectData(qc),
  });
}
