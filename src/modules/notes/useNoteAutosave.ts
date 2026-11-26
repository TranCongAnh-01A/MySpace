import { useEffect, useState, useSyncExternalStore } from 'react';
import { errorCode, noteGet, noteSave } from '@/lib/ipc/commands';
import {
  createSaveQueue,
  registerQueue,
  type SavePayload,
  type SaveQueue,
  type SaveSnapshot,
} from './autosaveQueue';

export type NoteAutosave = {
  snapshot: SaveSnapshot;
  schedule: (payload: SavePayload) => void;
  flush: () => Promise<void>;
  retry: () => Promise<void>;
  /** Bỏ mọi thay đổi chưa lưu (dùng trước khi xoá Note). */
  discard: () => void;
  keepMine: () => Promise<void>;
  /** Trả về Note mới nhất để tải lại editor. */
  loadSaved: () => Promise<Awaited<ReturnType<typeof noteGet>>>;
  queue: SaveQueue;
};

/**
 * Auto save cho một Note: lưu sau 1 giây không gõ; lưu ngay khi rời trang, đổi Note,
 * cửa sổ bị ẩn hoặc mất focus. `app-will-quit` được xử lý ở `src/app` qua `flushAllQueues`.
 */
export function useNoteAutosave(noteId: string, initialVersion: number): NoteAutosave {
  const [queue] = useState(() =>
    createSaveQueue({
      version: initialVersion,
      save: (p, v) => noteSave(noteId, p.title, p.contentJson, v),
      isConflict: (e) => errorCode(e) === 'CONFLICT',
    }),
  );
  const snapshot = useSyncExternalStore(queue.subscribe, () => queue.snapshot);

  useEffect(() => {
    const unregister = registerQueue(queue);
    const flush = () => void queue.flush();
    const onVisibility = () => {
      if (document.hidden) flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', flush);
      flush(); // rời trang Note / đổi sang Note khác
      unregister();
    };
  }, [queue]);

  return {
    snapshot,
    queue,
    schedule: (p) => queue.schedule(p),
    flush: () => queue.flush(),
    retry: () => queue.retry(),
    discard: () => queue.resolveUseSaved(queue.version),
    keepMine: async () => {
      const fresh = await noteGet(noteId);
      await queue.resolveKeepMine(fresh.version);
    },
    loadSaved: async () => {
      const fresh = await noteGet(noteId);
      queue.resolveUseSaved(fresh.version);
      return fresh;
    },
  };
}
