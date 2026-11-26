import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';

/** `CONFLICT` khi lưu: giữ bản của tôi (ghi đè) hoặc dùng bản đã lưu (bỏ thay đổi đang có). */
export function ConflictDialog({
  open,
  onKeepMine,
  onUseSaved,
}: {
  open: boolean;
  onKeepMine: () => Promise<void>;
  onUseSaved: () => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async (e: { preventDefault: () => void }) => {
    e.preventDefault(); // giữ dialog mở tới khi xử lý xong
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(t('notes.conflict.error'), { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogTitle>{t('notes.conflict.title')}</AlertDialogTitle>
        <AlertDialogDescription>{t('notes.conflict.desc')}</AlertDialogDescription>
        <DialogFooter>
          <AlertDialogCancel disabled={busy} onClick={run(onUseSaved)}>
            {t('notes.conflict.theirs')}
          </AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={run(onKeepMine)}>
            {t('notes.conflict.mine')}
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
