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
import { useAreas, useDateCtx } from './hooks';
import { PRIORITIES } from './filters';
import { TagPicker } from './TagPicker';
import { dateToStr } from './dateInput';

const NO_AREA = '__none';

function CreateForm({
  initialTitle,
  submitLabel,
  title,
  description,
  onSubmit,
  onCancel,
  error,
  pending,
}: {
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
  const [name, setName] = useState(initialTitle);
  const [due, setDue] = useState<Date | undefined>();
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
      ...(areaId !== NO_AREA ? { areaId } : {}),
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
          <Label htmlFor="create-area">{t('detail.area')}</Label>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger id="create-area" className="w-full">
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
        />
      </DialogContent>
    </Dialog>
  );
}
