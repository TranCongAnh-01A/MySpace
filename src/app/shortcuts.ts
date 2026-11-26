import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appQuit } from '@/lib/ipc/commands';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Phím tắt trong app (spec 4.6): Ctrl+2 Inbox, Ctrl+, Settings, Ctrl+Q thoát.
 * Ctrl+1/3/4/5 chưa gán (module chưa có). Không bắt phím khi đang gõ, trừ Ctrl+Q.
 */
export function useAppShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        void appQuit();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === '2') {
        e.preventDefault();
        void navigate('/inbox');
      } else if (e.key === ',') {
        e.preventDefault();
        void navigate('/settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
