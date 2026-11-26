import { useCallback, useEffect } from 'react';
import { useSettings } from '@/modules/settings/hooks';
import type { Language } from '@/lib/ipc/contract';
import { en } from './en';
import { vi, type Dict, type TKey } from './vi';

export type { TKey };
export const LANG_CACHE_KEY = 'lifehub.lang';
const dictionaries: Record<Language, Dict> = { vi, en };

export type TFunction = (key: TKey, vars?: Record<string, string | number>) => string;

export function translate(
  lang: Language,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  const text = dictionaries[lang][key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

function cachedLanguage(): Language {
  try {
    return localStorage.getItem(LANG_CACHE_KEY) === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

/** Ngôn ngữ hiện tại: lấy từ settings, trong lúc chờ thì dùng bản cache. */
export function useLanguage(): Language {
  const { data } = useSettings();
  const lang = data?.language ?? cachedLanguage();
  const fetched = data?.language;
  useEffect(() => {
    if (!fetched) return;
    try {
      localStorage.setItem(LANG_CACHE_KEY, fetched);
    } catch {
      /* bỏ qua */
    }
    document.documentElement.lang = fetched;
  }, [fetched]);
  return lang;
}

export function useT(): TFunction {
  const lang = useLanguage();
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
