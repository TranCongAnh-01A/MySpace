import { useT } from '@/lib/i18n';
import { CreateTaskDialog } from '@/modules/tasks/CreateTaskDialog';
import { useCreateTask } from '@/modules/tasks/hooks';
import { useUiStore } from './ui-store';

/** Dialog tạo Task dùng chung (Ctrl+N, nút "+" ở Tasks, Command Palette). */
export function GlobalCreateTask() {
  const t = useT();
  const open = useUiStore((s) => s.createTaskOpen);
  const setOpen = useUiStore((s) => s.setCreateTaskOpen);
  const create = useCreateTask(() => setOpen(false));
  return (
    <CreateTaskDialog
      open={open}
      onOpenChange={setOpen}
      title={t('create.title')}
      submitLabel={t('create.submit')}
      pending={create.isPending}
      error={create.error}
      onSubmit={(input) => create.mutate(input)}
    />
  );
}
