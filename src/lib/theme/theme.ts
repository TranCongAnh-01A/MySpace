import { useEffect } from 'react';
import type { Theme } from '@/lib/ipc/contract';

export const THEME_CACHE_KEY = 'lifehub.theme';
export type ResolvedTheme = 'dark' | 'light';

const query = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'Dark') return 'dark';
  if (theme === 'Light') return 'light';
  return query()?.matches === false ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* localStorage không dùng được: bỏ qua, chỉ mất chống nháy */
  }
  return resolved;
}

/** Áp dụng theme lên <html>; với `System` thì nghe thay đổi theme của Windows. */
export function useTheme(theme: Theme | undefined) {
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme !== 'System') return;
    const mq = query();
    if (!mq) return;
    const onChange = () => applyTheme('System');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
}
