import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import {
  errorMessage,
  noteCreate,
  noteDelete,
  noteGet,
  noteLinkTask,
  noteList,
  noteMove,
  noteSetTags,
  noteUnlinkTask,
  trashRestore,
} from '@/lib/ipc/commands';
import type { Note, NoteCreate, NoteFilter } from '@/lib/ipc/contract';

export function invalidateNoteData(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['notes'] });
  void qc.invalidateQueries({ queryKey: ['note'] });
  void qc.invalidateQueries({ queryKey: ['today'] });
  void qc.invalidateQueries({ queryKey: ['project'] });
  void qc.invalidateQueries({ queryKey: ['task'] });
  void qc.invalidateQueries({ queryKey: ['trash'] });
}

export const notesKey = (filter: NoteFilter) => ['notes', filter] as const;

export function useNotes(filter: NoteFilter = {}) {
  return useQuery({ queryKey: notesKey(filter), queryFn: () => noteList(filter) });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ['note', id],
    queryFn: () => noteGet(id ?? ''),
    enabled: !!id,
    retry: false,
  });
}

/** Tạo Note rồi mở nó (focus vào ô tiêu đề). */
export function useCreateNoteAndOpen() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: (input: NoteCreate) => noteCreate(input),
    onSuccess: (note) => {
      toast.success(t('notes.created'));
      void navigate(`/notes/${note.id}`, { state: { focusTitle: true } });
    },
    onError: (e) => toast.error(t('common.error'), { description: errorMessage(e) }),
    onSettled: () => invalidateNoteData(qc),
  });
  return useCallback((input: NoteCreate = {}) => m.mutate(input), [m]);
}

export function useDeleteNote(onDeleted?: () => void) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => noteDelete(id),
    onSuccess: (_v, id) => {
      onDeleted?.();
      toast(t('notes.deleted'), {
        duration: 5000,
        action: {
          label: t('tasks.undo'),
          onClick: () => void trashRestore('Note', id).then(() => invalidateNoteData(qc)),
        },
      });
    },
    onError: (e) => toast.error(t('common.error'), { description: errorMessage(e) }),
    onSettled: () => invalidateNoteData(qc),
  });
}

export function useNoteMutations(noteId: string) {
  const t = useT();
  const qc = useQueryClient();
  const onError = (e: unknown) => toast.error(t('common.error'), { description: errorMessage(e) });
  const onSettled = () => invalidateNoteData(qc);
  const move = useMutation({
    mutationFn: (projectId: string | null) => noteMove(noteId, { projectId }),
    onSuccess: (n: Note) => {
      qc.setQueryData(['note', noteId], n);
      toast.success(t('notes.moved'));
    },
    onError,
    onSettled,
  });
  const link = useMutation({
    mutationFn: (taskId: string) => noteLinkTask(noteId, taskId),
    onError,
    onSettled,
  });
  const unlink = useMutation({
    mutationFn: (taskId: string) => noteUnlinkTask(noteId, taskId),
    onError,
    onSettled,
  });
  const setTags = useMutation({
    mutationFn: (tagIds: string[]) => noteSetTags(noteId, tagIds),
    onSuccess: (n: Note) => qc.setQueryData(['note', noteId], n),
    onError,
    onSettled,
  });
  return { move, link, unlink, setTags };
}
