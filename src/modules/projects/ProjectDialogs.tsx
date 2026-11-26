import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/lib/i18n';
import { errorMessage, taskList } from '@/lib/ipc/commands';
import type { ChildMode, Project, ProjectCreate } from '@/lib/ipc/contract';
import { useAreas } from '@/modules/tasks/hooks';
import { useQuery } from '@tanstack/react-query';
import { AppearancePicker } from './AppearancePicker';
import { useCreateProject, useRetireProject, useUpdateProject } from './hooks';

const NO_AREA = '__none';

function CreateForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { data: areas = [] } = useAreas();
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState(NO_AREA);
  const [color, setColor] = useState<string | undefined>();
  const [icon, setIcon] = useState<string | undefined>();
  const create = useCreateProject((p) => {
    onDone();
    void navigate(`/projects/${p.id}`);
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const input: ProjectCreate = {
      name,
      ...(areaId !== NO_AREA ? { areaId } : {}),
      ...(color ? { color } : {}),
      ...(icon ? { icon } : {}),
    };
    create.mutate(input);
  }

  return (
    <form onSubmit={submit}>
      <DialogTitle>{t('proj.new')}</DialogTitle>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="proj-name">{t('proj.nameLabel')}</Label>
          <Input
            id="proj-name"
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={create.isError}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proj-area">{t('proj.area')}</Label>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger id="proj-area" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_AREA}>{t('detail.noArea')}</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AppearancePicker color={color} icon={icon} onColor={setColor} onIcon={setIcon} />
        {create.isError && (
          <p role="alert" className="text-danger">
            {errorMessage(create.error)}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {t('proj.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Dialog tạo Project (nút "+" ở sidebar, Command Palette). Form mount lại mỗi lần mở. */
export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <CreateForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(project.name);
  const update = useUpdateProject(project);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === project.name) return onDone();
    update.mutate({ name }, { onSuccess: onDone });
  }
  return (
    <form onSubmit={submit}>
      <DialogTitle>{t('proj.renameTitle')}</DialogTitle>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="proj-rename">{t('proj.nameLabel')}</Label>
        <Input
          id="proj-rename"
          autoFocus
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenameProjectDialog({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        {project && <RenameForm key={project.id} project={project} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** Dialog lưu trữ/xoá Project: chọn `mode` (mặc định "giữ công việc"), có ghi rõ hệ quả. */
export function RetireProjectDialog({
  project,
  kind,
  onClose,
  onDone,
}: {
  project: Project | null;
  kind: 'archive' | 'delete';
  onClose: () => void;
  onDone?: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<ChildMode>('Detach');
  const { data: children } = useQuery({
    queryKey: ['tasks', { projectId: project?.id }],
    queryFn: () => taskList({ projectId: project?.id ?? '' }),
    enabled: !!project,
  });
  const retire = useRetireProject(kind, () => {
    onClose();
    onDone?.();
  });
  const n = children?.length ?? 0;
  const withKey = kind === 'archive' ? 'proj.mode.archiveWith' : 'proj.mode.deleteWith';
  const hintKey =
    kind === 'archive'
      ? mode === 'WithChildren'
        ? 'proj.hint.archiveWith'
        : 'proj.hint.archiveDetach'
      : mode === 'WithChildren'
        ? 'proj.hint.deleteWith'
        : 'proj.hint.deleteDetach';
  const options: { value: ChildMode; label: string }[] = [
    { value: 'WithChildren', label: t(withKey, { n }) },
    { value: 'Detach', label: t('proj.mode.detach') },
  ];

  return (
    <AlertDialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogTitle>
          {t(kind === 'archive' ? 'proj.archiveTitle' : 'proj.deleteTitle', {
            name: project?.name ?? '',
          })}
        </AlertDialogTitle>
        <AlertDialogDescription className="sr-only">{t(hintKey)}</AlertDialogDescription>
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">{t('proj.picker')}</legend>
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="retire-mode"
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
                className="mt-1 accent-primary"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          {t(hintKey)}
        </p>
        {retire.isError && (
          <p role="alert" className="mt-2 text-danger">
            {errorMessage(retire.error)}
          </p>
        )}
        <DialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant={kind === 'delete' ? 'danger' : 'default'}
            disabled={retire.isPending || !project}
            onClick={() => project && retire.mutate({ id: project.id, mode })}
          >
            {t(kind === 'archive' ? 'proj.archive' : 'proj.delete')}
          </Button>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
