import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/ipc/commands';
import { useT } from '@/lib/i18n';
import { useCreateInbox } from '@/modules/inbox/hooks';
import { useUiStore } from './ui-store';

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const create = useCreateInbox(onDone);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    create.mutate(text);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
  }

  return (
    <form onSubmit={submit}>
      <DialogTitle>{t('quickAdd.title')}</DialogTitle>
      <DialogDescription>{t('quickAdd.description')}</DialogDescription>
      <div className="mt-4 space-y-2">
        <Label htmlFor="quick-add-text">{t('quickAdd.label')}</Label>
        <Textarea
          id="quick-add-text"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={create.isError}
        />
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
          {t('common.add')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Dialog "Thêm nhanh" từ titlebar: tạo Inbox item. Form được mount lại mỗi lần mở nên luôn sạch. */
export function QuickAddDialog() {
  const open = useUiStore((s) => s.quickAddOpen);
  const setOpen = useUiStore((s) => s.setQuickAddOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <QuickAddForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
