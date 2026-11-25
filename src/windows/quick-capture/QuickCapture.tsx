import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { errorMessage, inboxCreate } from '../../lib/ipc/commands';

// UI thô; phiên C hoàn thiện.
export function QuickCapture() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mỗi lần cửa sổ được hiện lại: xoá nội dung cũ và focus vào ô nhập.
  useEffect(() => {
    inputRef.current?.focus();
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        setText('');
        setError(null);
        inputRef.current?.focus();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const hide = () => void getCurrentWindow().hide();

  async function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      hide();
    } else if (e.key === 'Enter' && !busy) {
      e.preventDefault();
      setBusy(true);
      try {
        await inboxCreate(text);
        setText('');
        setError(null);
        hide();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="flex h-full flex-col justify-center rounded-lg bg-[#1c1c24] px-4">
      <input
        ref={inputRef}
        autoFocus
        aria-label="Ghi nhanh"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => void onKeyDown(e)}
        placeholder="Ghi nhanh vào Inbox… (Enter để lưu, Esc để đóng)"
        className="w-full bg-transparent text-lg outline-none"
      />
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
