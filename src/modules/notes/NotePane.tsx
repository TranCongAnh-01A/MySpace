import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Editor } from '@tiptap/core';
import { MoreHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { useT } from '@/lib/i18n';
import type { Note } from '@/lib/ipc/contract';
import { useProjects } from '@/modules/projects/hooks';
import { useTasks } from '@/modules/tasks/hooks';
import { TagPicker } from '@/modules/tasks/TagPicker';
import { ConflictDialog } from './ConflictDialog';
import { NoteEditor } from './editor/NoteEditor';
import { useDeleteNote, useNoteMutations } from './hooks';
import { ItemPicker } from './ItemPicker';
import { SaveIndicator } from './SaveIndicator';
import { useNoteAutosave } from './useNoteAutosave';

type Picker = 'project' | 'task' | null;

/** Một Note đang mở: tiêu đề, thanh thông tin, editor, auto save. Mount lại (key) khi đổi Note. */
export function NotePane({
  note,
  onReload,
  onDeleted,
}: {
  note: Note;
  onReload: (fresh: Note) => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const location = useLocation();
  const autosave = useNoteAutosave(note.id, note.version);
  const { move, link, unlink, setTags } = useNoteMutations(note.id);
  const del = useDeleteNote(onDeleted);
  const { data: projects = [] } = useProjects(false);
  const { data: tasks = [] } = useTasks({});
  const [title, setTitle] = useState(note.title);
  const contentRef = useRef(note.contentJson);
  const editorRef = useRef<Editor | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const focusTitle = (location.state as { focusTitle?: boolean } | null)?.focusTitle === true;

  const project = projects.find((p) => p.id === note.projectId);
  const taskById = new Map(tasks.map((x) => [x.id, x]));
  const linkable = tasks.filter((x) => !note.taskIds.includes(x.id));

  return (
    <div className="flex h-full min-w-0 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-3 px-8 py-6">
        <input
          autoFocus={focusTitle}
          aria-label={t('notes.titleLabel')}
          placeholder={t('notes.titlePlaceholder')}
          value={title}
          maxLength={300}
          onChange={(e) => {
            setTitle(e.target.value);
            autosave.schedule({ title: e.target.value, contentJson: contentRef.current });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editorRef.current?.commands.focus('start');
            }
          }}
          className="w-full bg-transparent text-3xl font-semibold text-text outline-none placeholder:text-muted"
        />

        <div
          role="group"
          aria-label={t('notes.info')}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
        >
          <span className="inline-flex items-center gap-1.5 text-muted">
            {t('notes.project')}:
            <span className="text-text">{project?.name ?? t('notes.noProject')}</span>
          </span>
          <TagPicker value={note.tagIds} onChange={(ids) => setTags.mutate(ids)} />
          <span className="ml-auto flex items-center gap-2">
            <SaveIndicator snapshot={autosave.snapshot} onRetry={() => void autosave.retry()} />
            <span className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t('notes.menu')}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setPicker('project')}>
                    {t('notes.moveTo')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPicker('task')}>
                    {t('notes.linkTask')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      autosave.discard();
                      del.mutate(note.id);
                    }}
                  >
                    {t('notes.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ItemPicker
                open={picker !== null}
                onOpenChange={(o) => !o && setPicker(null)}
                trigger={<span aria-hidden className="absolute right-0 bottom-0 size-0" />}
                items={
                  picker === 'project'
                    ? [
                        { id: '', label: t('notes.noProject') },
                        ...projects.map((p) => ({ id: p.id, label: p.name })),
                      ]
                    : linkable.map((x) => ({ id: x.id, label: x.title }))
                }
                searchLabel={
                  picker === 'project' ? t('notes.searchProject') : t('notes.searchTask')
                }
                emptyText={t('notes.noTaskMatch')}
                onPick={(id) => {
                  if (picker === 'project') move.mutate(id || null);
                  else link.mutate(id);
                }}
              />
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">{t('notes.tasks')}:</span>
          {note.taskIds.length === 0 && <span className="text-muted">{t('notes.noTasks')}</span>}
          {note.taskIds.map((tid) => {
            const task = taskById.get(tid);
            const name = task?.title ?? tid;
            return (
              <Badge key={tid} className="gap-1 pr-1">
                <span className="max-w-48 truncate">{name}</span>
                <button
                  type="button"
                  aria-label={t('notes.unlinkTask', { title: name })}
                  onClick={() => unlink.mutate(tid)}
                  className="rounded p-0.5 hover:bg-border"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            );
          })}
        </div>

        <div className="pt-2">
          <NoteEditor
            initialContent={note.contentJson}
            ariaLabel={t('notes.editorLabel')}
            onReady={(e) => {
              editorRef.current = e;
              if (!focusTitle && note.title) e.commands.focus('end');
            }}
            onChange={(json) => {
              contentRef.current = json;
              autosave.schedule({ title, contentJson: json });
            }}
          />
        </div>
      </div>
      <ConflictDialog
        open={autosave.snapshot.status === 'conflict'}
        onKeepMine={autosave.keepMine}
        onUseSaved={async () => onReload(await autosave.loadSaved())}
      />
    </div>
  );
}
