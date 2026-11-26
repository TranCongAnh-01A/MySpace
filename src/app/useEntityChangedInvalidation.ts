import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onEntityChanged } from '@/lib/ipc/events';

/** Query key theo entity (analysis mục 3): settings → ['settings'], area → ['areas'], inbox → ['inbox', ...]. */
const KEYS_BY_ENTITY: Record<string, readonly (readonly string[])[]> = {
  settings: [['settings'], ['today']],
  area: [['areas']],
  inbox: [['inbox']],
  tag: [['tags']],
  task: [['tasks'], ['task'], ['today'], ['project'], ['trash'], ['calendar'], ['reminders']],
  event: [['calendar'], ['today'], ['reminders']],
  reminder: [['calendar'], ['today'], ['reminders'], ['task']],
  project: [['projects'], ['project'], ['today'], ['tasks'], ['trash']],
};

export function useEntityChangedInvalidation() {
  const qc = useQueryClient();
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onEntityChanged((e) => {
      KEYS_BY_ENTITY[e.entity]?.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
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
