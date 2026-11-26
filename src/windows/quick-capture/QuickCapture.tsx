import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PencilLine } from 'lucide-react';
import { errorMessage, inboxCreate, settingsGet } from '@/lib/ipc/commands';
import { LANG_CACHE_KEY, translate, type TFunction } from '@/lib/i18n';
import { applyTheme } from '@/lib/theme/theme';
import type { Language } from '@/lib/ipc/contract';
import { appWindow } from '@/lib/tauri';

function cachedLanguage(): Language {
  try {
    return localStorage.getItem(LANG_CACHE_KEY) === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

// Cửa sổ Quick Capture: nhỏ, không viền. Hành vi giữ nguyên phase A; giao diện dùng token.
export function QuickCapture() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cửa sổ này là một WebView riêng, không có QueryClientProvider của app chính: đọc settings trực tiếp.
  // Lỗi (core chưa có settings_get) thì dùng bản cache của ngôn ngữ/theme.
  const [lang, setLang] = useState<Language>(cachedLanguage);
  const t: TFunction = (key, vars) => translate(lang, key, vars);

  useEffect(() => {
    settingsGet()
      .then((s) => {
        setLang(s.language);
        applyTheme(s.theme);
        try {
          localStorage.setItem(LANG_CACHE_KEY, s.language);
        } catch {
          /* bỏ qua */
        }
      })
      .catch(() => {});
  }, []);

  // Mỗi lần cửa sổ được hiện lại: xoá nội dung cũ và focus vào ô nhập.
  useEffect(() => {
    inputRef.current?.focus();
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void appWindow
      .onFocusChanged((focused) => {
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

  const hide = () => void appWindow.hide();

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
    <div className="flex h-full flex-col justify-center rounded-lg border border-border bg-surface px-4">
      <div className="flex items-center gap-3">
        <PencilLine className="size-5 shrink-0 text-primary" aria-hidden />
        <input
          ref={inputRef}
          autoFocus
          autoComplete="off"
          aria-label={t('capture.label')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => void onKeyDown(e)}
          placeholder={t('capture.placeholder')}
          className="w-full bg-transparent text-lg text-text outline-none placeholder:text-muted"
        />
      </div>
      <p className="mt-1 pl-8 text-xs text-muted">{t('capture.syntaxHint')}</p>
      {error && (
        <p role="alert" className="pl-8 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
