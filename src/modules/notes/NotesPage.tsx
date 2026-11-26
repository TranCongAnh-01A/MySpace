import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { NotebookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { LoadingBlock } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { foldText } from '@/lib/format/text';
import { useT, type TKey } from '@/lib/i18n';
import { errorCode, errorMessage } from '@/lib/ipc/commands';
import type { Note, NoteSort } from '@/lib/ipc/contract';
import { useProjects } from '@/modules/projects/hooks';
import { useTags } from '@/modules/tasks/hooks';
import { useCreateNoteAndOpen, useNote, useNotes } from './hooks';
import { NoteListItems } from './NoteListItems';
import { NotePane } from './NotePane';

const ALL = '__all';
const SORTS: readonly NoteSort[] = ['Updated', 'Title', 'Created'];

function NoteView({ id }: { id: string }) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useNote(id);
  // Tăng sau "Dùng bản đã lưu" để dựng lại editor từ bản đã lưu.
  const [epoch, setEpoch] = useState(0);

  if (isLoading) return <LoadingBlock label={t('common.loading')} rows={6} />;
  if (errorCode(error) === 'NOT_FOUND')
    return (
      <div className="p-6">
        <EmptyState
          icon={<NotebookText />}
          title={t('notes.notFound')}
          hint={t('notes.notFoundHint')}
          action={
            <Link className="text-primary underline" to="/notes">
              {t('notes.title')}
            </Link>
          }
        />
      </div>
    );
  if (error || !data)
    return (
      <div className="p-6">
        <ErrorState
          title={t('common.loadError')}
          message={errorMessage(error)}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </div>
    );
  return (
    <NotePane
      key={`${id}:${epoch}`}
      note={data}
      onReload={(fresh: Note) => {
        qc.setQueryData(['note', id], fresh);
        setEpoch((n) => n + 1);
      }}
      onDeleted={() => void navigate('/notes', { replace: true })}
    />
  );
}

export function NotesPage() {
  const t = useT();
  const { id } = useParams();
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState(ALL);
  const [tagId, setTagId] = useState(ALL);
  const [sort, setSort] = useState<NoteSort>('Updated');
  const { data: projects = [] } = useProjects(false);
  const { data: tags = [] } = useTags();
  const create = useCreateNoteAndOpen();
  const { data, isLoading, error, refetch } = useNotes({
    sort,
    ...(projectId !== ALL ? { projectId } : {}),
    ...(tagId !== ALL ? { tagId } : {}),
  });

  const q = foldText(text).trim();
  const visible = (data ?? []).filter((n) => !q || foldText(`${n.title} ${n.excerpt}`).includes(q));

  let list;
  if (isLoading) list = <LoadingBlock label={t('common.loading')} />;
  else if (error)
    list = (
      <div className="p-3">
        <ErrorState
          title={t('common.loadError')}
          message={errorMessage(error)}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </div>
    );
  else if (!data || data.length === 0)
    list = (
      <div className="p-3">
        <EmptyState
          icon={<NotebookText />}
          title={projectId !== ALL || tagId !== ALL ? t('notes.emptyFiltered') : t('notes.empty')}
          hint={t('notes.emptyHint')}
        />
      </div>
    );
  else if (visible.length === 0)
    list = <p className="p-4 text-center text-muted">{t('notes.emptyFiltered')}</p>;
  else list = <NoteListItems notes={visible} activeId={id} label={t('notes.list')} />;

  return (
    <div className="flex h-full min-w-0">
      <section
        aria-label={t('notes.title')}
        className="flex w-80 shrink-0 flex-col border-r border-border"
      >
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">{t('notes.title')}</h1>
            <Button size="sm" aria-label={t('notes.newAria')} onClick={() => create()}>
              {t('notes.new')}
            </Button>
          </div>
          <Input
            aria-label={t('notes.filterText')}
            placeholder={t('notes.filterPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger aria-label={t('notes.filterProject')} className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('notes.allProjects')}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagId} onValueChange={setTagId}>
              <SelectTrigger aria-label={t('notes.filterTag')} className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('notes.allTags')}</SelectItem>
                {tags.map((tg) => (
                  <SelectItem key={tg.id} value={tg.id}>
                    {tg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as NoteSort)}>
            <SelectTrigger aria-label={t('notes.sort')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`notes.sort.${s}` as TKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{list}</div>
      </section>
      <section aria-label={t('notes.editorLabel')} className="min-w-0 flex-1">
        {id ? (
          <NoteView key={id} id={id} />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState icon={<NotebookText />} title={t('notes.pick')} />
          </div>
        )}
      </section>
    </div>
  );
}
