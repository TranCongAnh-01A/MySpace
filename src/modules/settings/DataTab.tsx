import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Database, FileDown, FolderOpen, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
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
import {
  appInfo,
  backupList,
  backupNow,
  backupRestore,
  errorCode,
  errorMessage,
  exportJson,
  openDataFolder,
  openLogFolder,
  seedDemoData,
} from '@/lib/ipc/commands';
import type { Backup } from '@/lib/ipc/contract';
import { formatBytes, formatDateTime } from '@/lib/format/date';
import { useT, type TKey } from '@/lib/i18n';
import { useSettings } from './hooks';

const BACKUPS_KEY = ['backups'] as const;

function BackupRow({ backup, onError }: { backup: Backup; onError: (e: unknown) => void }) {
  const t = useT();
  const { data: settings } = useSettings();
  const restore = useMutation({ mutationFn: () => backupRestore(backup.fileName), onError });
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-4 tabular-nums">
        {formatDateTime(backup.createdAt, settings?.dateFormat ?? 'DD/MM/YYYY', settings?.timezone)}
      </td>
      <td className="py-2 pr-4">
        <Badge>{t(`data.reason.${backup.reason}` as TKey)}</Badge>
      </td>
      <td className="py-2 pr-4 tabular-nums">{formatBytes(backup.sizeBytes)}</td>
      <td className="py-2 text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t('data.restoreAria', { name: backup.fileName })}
            >
              {t('data.restore')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t('data.restoreTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('data.restoreDesc')}</AlertDialogDescription>
            <DialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction danger onClick={() => restore.mutate()}>
                {t('data.restore')}
              </AlertDialogAction>
            </DialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

export function DataTab() {
  const t = useT();
  const qc = useQueryClient();
  const toastError = (e: unknown) =>
    toast.error(t('common.error'), { description: errorMessage(e) });

  const info = useQuery({ queryKey: ['appinfo'], queryFn: appInfo, staleTime: Infinity });
  const backups = useQuery({ queryKey: BACKUPS_KEY, queryFn: backupList });

  const backup = useMutation({
    mutationFn: backupNow,
    onSuccess: (b) => {
      toast.success(t('data.backupDone', { name: b.fileName }));
      void qc.invalidateQueries({ queryKey: BACKUPS_KEY });
    },
    onError: toastError,
  });
  const exporting = useMutation({
    mutationFn: exportJson,
    onSuccess: (path) => {
      if (path) toast.success(t('data.exported', { path }));
    },
    onError: toastError,
  });
  const seed = useMutation({
    mutationFn: seedDemoData,
    onSuccess: () => {
      toast.success(t('data.seeded'));
      void qc.invalidateQueries();
    },
    onError: (e) => {
      if (errorCode(e) === 'CONFLICT') toast.info(t('data.seedExists'));
      else toastError(e);
    },
  });
  const openData = useMutation({ mutationFn: openDataFolder, onError: toastError });
  const openLogs = useMutation({ mutationFn: openLogFolder, onError: toastError });

  let list;
  if (backups.isLoading) list = <LoadingBlock label={t('common.loading')} rows={2} />;
  else if (backups.error)
    list = (
      <ErrorState
        title={t('common.loadError')}
        message={errorMessage(backups.error)}
        retryLabel={t('common.retry')}
        onRetry={() => void backups.refetch()}
      />
    );
  else if (!backups.data || backups.data.length === 0)
    list = (
      <EmptyState
        icon={<Archive />}
        title={t('data.backupEmpty')}
        hint={t('data.backupEmptyHint')}
      />
    );
  else
    list = (
      <table className="w-full text-left">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pb-2 pr-4 font-medium">
              {t('data.col.date')}
            </th>
            <th scope="col" className="pb-2 pr-4 font-medium">
              {t('data.col.type')}
            </th>
            <th scope="col" className="pb-2 pr-4 font-medium">
              {t('data.col.size')}
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              {t('data.col.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {backups.data.map((b) => (
            <BackupRow key={b.fileName} backup={b} onError={toastError} />
          ))}
        </tbody>
      </table>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t('data.location')}</CardTitle>
        {info.isLoading ? (
          <LoadingBlock label={t('common.loading')} rows={1} />
        ) : info.error ? (
          <ErrorState
            title={t('common.loadError')}
            message={errorMessage(info.error)}
            retryLabel={t('common.retry')}
            onRetry={() => void info.refetch()}
          />
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 break-all">
              <Database className="size-4 shrink-0 text-muted" />
              <code>{info.data?.dataDir}</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => openData.mutate()}>
                <FolderOpen />
                {t('data.openData')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => openLogs.mutate()}>
                <ScrollText />
                {t('data.openLogs')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={exporting.isPending}
                onClick={() => exporting.mutate()}
              >
                <FileDown />
                {t('data.export')}
              </Button>
            </div>
            <p className="text-muted">{t('data.version', { version: info.data?.version ?? '' })}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle className="mb-0">{t('data.backups')}</CardTitle>
          <Button size="sm" disabled={backup.isPending} onClick={() => backup.mutate()}>
            {t('data.backupNow')}
          </Button>
        </div>
        {list}
      </Card>

      {import.meta.env.DEV && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="mb-0">{t('data.seed')}</CardTitle>
              <p className="text-muted">{t('data.seedHint')}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={seed.isPending}
              onClick={() => seed.mutate()}
            >
              {t('data.seed')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
