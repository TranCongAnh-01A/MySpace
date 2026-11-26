import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingBlock } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format/date';
import { useT, type TKey } from '@/lib/i18n';
import { errorMessage, trashEmpty, trashList, trashRestore } from '@/lib/ipc/commands';
import type { TrashItem } from '@/lib/ipc/contract';
import { useDateCtx } from '@/modules/tasks/hooks';

const DAY = 86_400_000;

export function TrashPage() {
  const t = useT();
  const qc = useQueryClient();
  const ctx = useDateCtx();
  const [now] = useState(() => Date.now());
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['trash'], queryFn: trashList });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['trash'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['inbox'] });
    void qc.invalidateQueries({ queryKey: ['notes'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['project'] });
    void qc.invalidateQueries({ queryKey: ['today'] });
  };
  const toastError = (e: unknown) =>
    toast.error(t('common.error'), { description: errorMessage(e) });
  const restore = useMutation({
    mutationFn: (i: TrashItem) => trashRestore(i.kind, i.id),
    onSuccess: () => toast.success(t('trash.restored')),
    onError: toastError,
    onSettled: refresh,
  });
  const empty = useMutation({ mutationFn: trashEmpty, onError: toastError, onSettled: refresh });

  const daysLeft = (i: TrashItem) =>
    Math.max(0, Math.ceil((new Date(i.purgeAt).getTime() - now) / DAY));

  let body;
  if (isLoading) body = <LoadingBlock label={t('common.loading')} />;
  else if (error)
    body = (
      <ErrorState
        title={t('common.loadError')}
        message={errorMessage(error)}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  else if (!data || data.length === 0)
    body = <EmptyState icon={<Trash2 />} title={t('trash.empty')} hint={t('trash.emptyHint')} />;
  else
    body = (
      <table className="w-full text-left">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pb-2 pr-4 font-medium">
              {t('trash.col.type')}
            </th>
            <th scope="col" className="pb-2 pr-4 font-medium">
              {t('trash.col.title')}
            </th>
            <th scope="col" className="pb-2 pr-4 font-medium">
              {t('trash.col.deleted')}
            </th>
            <th scope="col" className="pb-2 pr-4 font-medium">
              {t('trash.col.purge')}
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              {t('trash.col.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((i) => {
            const n = daysLeft(i);
            return (
              <tr key={`${i.kind}-${i.id}`} className="border-t border-border">
                <td className="py-2 pr-4">
                  <Badge>{t(`trash.kind.${i.kind}` as TKey)}</Badge>
                </td>
                <td className="max-w-xs truncate py-2 pr-4">{i.title}</td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatDateTime(i.deletedAt, ctx.dateFormat, ctx.timezone)}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {n === 0 ? t('trash.purgeSoon') : t('trash.purgeIn', { n })}
                </td>
                <td className="py-2 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t('trash.restoreAria', { title: i.title })}
                    onClick={() => restore.mutate(i)}
                  >
                    {t('trash.restore')}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t('trash.title')}</h1>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" size="sm" disabled={!data || data.length === 0}>
                {t('trash.emptyAll')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>{t('trash.emptyAllTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('trash.emptyAllDesc')}</AlertDialogDescription>
              <DialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction danger onClick={() => empty.mutate()}>
                  {t('trash.emptyAll')}
                </AlertDialogAction>
              </DialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {body}
      </div>
    </div>
  );
}
