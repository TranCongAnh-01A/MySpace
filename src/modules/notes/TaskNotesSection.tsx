import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { errorMessage, noteLinkTask, noteUnlinkTask } from '@/lib/ipc/commands';
import { invalidateNoteData, useCreateNoteAndOpen, useNotes } from './hooks';
import { ItemPicker } from './ItemPicker';

/** Mục "Ghi chú" trong panel Task: danh sách Note liên kết, tạo mới, liên kết/bỏ liên kết. */
export function TaskNotesSection({ taskId, noteIds }: { taskId: string; noteIds: string[] }) {
  const t = useT();
  const qc = useQueryClient();
  const create = useCreateNoteAndOpen();
  // `noteIds` đổi (liên kết/bỏ liên kết) thì key của query này đổi theo.
  const { data: linked = [] } = useNotes({ taskId });
  const { data: all = [] } = useNotes({});
  const onError = (e: unknown) => toast.error(t('common.error'), { description: errorMessage(e) });
  const onSettled = () => invalidateNoteData(qc);
  const link = useMutation({
    mutationFn: (noteId: string) => noteLinkTask(noteId, taskId),
    onError,
    onSettled,
  });
  const unlink = useMutation({
    mutationFn: (noteId: string) => noteUnlinkTask(noteId, taskId),
    onError,
    onSettled,
  });
  const candidates = all
    .filter((n) => !noteIds.includes(n.id))
    .map((n) => ({ id: n.id, label: n.title || t('notes.untitled') }));

  return (
    <section aria-labelledby="d-notes" className="space-y-2">
      <h3 id="d-notes" className="text-sm font-medium">
        {t('notes.forTask')}
      </h3>
      {linked.length === 0 ? (
        <p className="text-muted">{t('notes.taskNone')}</p>
      ) : (
        <ul className="space-y-1">
          {linked.map((n) => (
            <li key={n.id} className="flex items-center gap-1">
              <Link
                to={`/notes/${n.id}`}
                className="min-w-0 flex-1 truncate rounded px-1 py-0.5 hover:underline"
              >
                {n.title || t('notes.untitled')}
              </Link>
              <button
                type="button"
                aria-label={t('notes.unlinkNote', { title: n.title || t('notes.untitled') })}
                onClick={() => unlink.mutate(n.id)}
                className="rounded p-1 text-muted hover:bg-border/60"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => create({ taskId })}>
          {t('notes.createForTask')}
        </Button>
        <ItemPicker
          trigger={
            <Button variant="secondary" size="sm">
              {t('notes.linkExisting')}
            </Button>
          }
          items={candidates}
          searchLabel={t('notes.searchNote')}
          emptyText={t('notes.noNoteMatch')}
          onPick={(id) => link.mutate(id)}
        />
      </div>
    </section>
  );
}
