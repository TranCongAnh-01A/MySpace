import { useT } from '@/lib/i18n';
import { CreateProjectDialog } from '@/modules/projects/ProjectDialogs';
import { CreateTaskDialog } from '@/modules/tasks/CreateTaskDialog';
import { useCreateTask } from '@/modules/tasks/hooks';
import { useUiStore } from './ui-store';

/** Dialog tạo Task dùng chung (Ctrl+N, nút "+" ở Tasks, Command Palette). */
export function GlobalCreateTask() {
  const t = useT();
  const open = useUiStore((s) => s.createTaskOpen);
  const setOpen = useUiStore((s) => s.setCreateTaskOpen);
  const projectId = useUiStore((s) => s.createTaskProjectId);
  const create = useCreateTask(() => setOpen(false));
  return (
    <CreateTaskDialog
      open={open}
      onOpenChange={setOpen}
      title={t('create.title')}
      submitLabel={t('create.submit')}
      defaultProjectId={projectId}
      pending={create.isPending}
      error={create.error}
      onSubmit={(input) => create.mutate(input)}
    />
  );
}

/** Dialog tạo Project dùng chung (nút "+" ở sidebar, Command Palette). */
export function GlobalCreateProject() {
  const open = useUiStore((s) => s.createProjectOpen);
  const setOpen = useUiStore((s) => s.setCreateProjectOpen);
  return <CreateProjectDialog open={open} onOpenChange={setOpen} />;
}
