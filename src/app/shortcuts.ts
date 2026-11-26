import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateNoteAndOpen } from '@/modules/notes/hooks';
import { appQuit } from '@/lib/ipc/commands';
import { useUiStore } from './ui-store';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Phím tắt trong app (spec 4.6): Ctrl+1 Today, Ctrl+2 Inbox, Ctrl+3 Tasks, Ctrl+4 Calendar, Ctrl+5 Notes, Ctrl+K palette, Ctrl+N tạo Task (ở trang Notes: tạo ghi chú), Ctrl+, Settings, Ctrl+Q thoát.
 * Không bắt phím khi đang gõ, trừ Ctrl+Q (và Ctrl+N ở trang Notes).
 */
export function useAppShortcuts() {
  const navigate = useNavigate();
  const createNote = useCreateNoteAndOpen();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        void appQuit();
        return;
      }
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUiStore.getState().setPaletteOpen(true);
        return;
      }
      const onNotes = window.location.pathname.startsWith('/notes');
      if (onNotes && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNote();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        useUiStore.getState().setCreateTaskOpen(true);
      } else if (e.key === '1') {
        e.preventDefault();
        void navigate('/today');
      } else if (e.key === '3') {
        e.preventDefault();
        void navigate('/tasks');
      } else if (e.key === '4') {
        e.preventDefault();
        void navigate('/calendar');
      } else if (e.key === '2') {
        e.preventDefault();
        void navigate('/inbox');
      } else if (e.key === '5') {
        e.preventDefault();
        void navigate('/notes');
      } else if (e.key === ',') {
        e.preventDefault();
        void navigate('/settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, createNote]);
}
