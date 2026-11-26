import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useT, type TKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';
import type { Priority, TaskCreate } from '@/lib/ipc/contract';
import { useProjects } from '@/modules/projects/hooks';
import { useAreas, useDateCtx } from './hooks';
import { PRIORITIES } from './filters';
import { TagPicker } from './TagPicker';
import { dateToStr, strToDate } from './dateInput';

const NO_AREA = '__none';
const NO_PROJECT = '__none-project';

function CreateForm({
  initialTitle,
  submitLabel,
  title,
  description,
  onSubmit,
  onCancel,
  error,
  pending,
  defaultProjectId,
  defaultDueDate,
}: {
  defaultProjectId?: string | undefined;
  defaultDueDate?: string | undefined;
  initialTitle: string;
  submitLabel: string;
  title: string;
  description?: string;
  onSubmit: (input: TaskCreate) => void;
  onCancel: () => void;
  error: unknown;
  pending: boolean;
}) {
  const t = useT();
  const ctx = useDateCtx();
  const { data: areas = [] } = useAreas();
  const { data: projects = [] } = useProjects(false);
  const [name, setName] = useState(initialTitle);
  const [due, setDue] = useState<Date | undefined>(
    defaultDueDate ? strToDate(defaultDueDate) : undefined,
  );
  const [projectId, setProjectId] = useState(defaultProjectId ?? NO_PROJECT);
  const project = projects.find((p) => p.id === projectId);
  const [priority, setPriority] = useState<Priority>('Medium');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [areaId, setAreaId] = useState(NO_AREA);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      title: name,
      priority,
      ...(due ? { dueDate: dateToStr(due) } : {}),
      ...(tagIds.length ? { tagIds } : {}),
      ...(project ? { projectId: project.id } : areaId !== NO_AREA ? { areaId } : {}),
    });
  }

  return (
    <form onSubmit={submit}>
      <DialogTitle>{title}</DialogTitle>
      {description && <DialogDescription>{description}</DialogDescription>}
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="create-title">{t('create.titleLabel')}</Label>
          <Input
            id="create-title"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="create-due">{t('detail.dueDate')}</Label>
            <DatePicker
              value={due}
              onChange={setDue}
              language={ctx.language}
              dateFormat={ctx.dateFormat}
              placeholder={t('detail.pickDate')}
              ariaLabel={t('detail.dueDate')}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-priority">{t('detail.priority')}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger id="create-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`priority.${p}` as TKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-project">{t('proj.picker')}</Label>
          <Select value={project ? projectId : NO_PROJECT} onValueChange={setProjectId}>
            <SelectTrigger id="create-project" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>{t('proj.none')}</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-area">{t('detail.area')}</Label>
          <Select
            value={project ? (project.areaId ?? NO_AREA) : areaId}
            onValueChange={setAreaId}
            disabled={!!project}
          >
            <SelectTrigger
              id="create-area"
              className="w-full"
              title={project ? t('proj.areaFromProject') : undefined}
            >
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
        <div className="space-y-1.5">
          <Label htmlFor="create-tags">{t('detail.tags')}</Label>
          <TagPicker id="create-tags" value={tagIds} onChange={setTagIds} />
        </div>
        {!!error && (
          <p role="alert" className="text-danger">
            {errorMessage(error)}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTitle?: string;
  title: string;
  description?: string;
  submitLabel: string;
  onSubmit: (input: TaskCreate) => void;
  error?: unknown;
  pending?: boolean;
  defaultProjectId?: string | undefined;
  defaultDueDate?: string | undefined;
};

/** Dialog tạo Task (dùng cho Ctrl+N, nút "+" và "Chuyển Inbox thành Task"). Form mount lại mỗi lần mở. */
export function CreateTaskDialog({
  open,
  onOpenChange,
  initialTitle = '',
  title,
  description,
  submitLabel,
  onSubmit,
  error,
  pending = false,
  defaultProjectId,
  defaultDueDate,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <CreateForm
          initialTitle={initialTitle}
          submitLabel={submitLabel}
          title={title}
          {...(description ? { description } : {})}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          error={error}
          pending={pending}
          defaultProjectId={defaultProjectId}
          defaultDueDate={defaultDueDate}
        />
      </DialogContent>
    </Dialog>
  );
}
