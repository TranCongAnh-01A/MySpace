import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onEntityChanged } from '@/lib/ipc/events';

/** Query key theo entity (analysis mục 3): settings → ['settings'], area → ['areas'], inbox → ['inbox', ...]. */
const KEY_BY_ENTITY: Record<string, readonly string[]> = {
  settings: ['settings'],
  area: ['areas'],
  inbox: ['inbox'],
};

export function useEntityChangedInvalidation() {
  const qc = useQueryClient();
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onEntityChanged((e) => {
      const key = KEY_BY_ENTITY[e.entity];
      if (key) void qc.invalidateQueries({ queryKey: key });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [qc]);
}
