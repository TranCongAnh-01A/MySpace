import { NotebookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingBlock } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';
import { useCreateNoteAndOpen, useNotes } from './hooks';
import { NoteListItems } from './NoteListItems';

/** Tab Notes của Project: danh sách Note của Project + nút tạo Note có sẵn `projectId`. */
export function ProjectNotesTab({ projectId }: { projectId: string }) {
  const t = useT();
  const create = useCreateNoteAndOpen();
  const { data, isLoading, error, refetch } = useNotes({ projectId });
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
    body = (
      <EmptyState
        icon={<NotebookText />}
        title={t('notes.projectEmpty')}
        hint={t('notes.emptyHint')}
      />
    );
  else
    body = (
      <div className="rounded-md border border-border">
        <NoteListItems notes={data} label={t('notes.list')} />
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('notes.tab')}</h2>
        <Button size="sm" onClick={() => create({ projectId })}>
          {t('notes.new')}
        </Button>
      </div>
      {body}
    </div>
  );
}
