import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import {
  errorMessage,
  reminderDelete,
  reminderDismiss,
  reminderDismissAll,
  reminderList,
  reminderMissedList,
  reminderSet,
} from '@/lib/ipc/commands';
import type { ReminderSet } from '@/lib/ipc/contract';

export type ReminderSource = { kind: 'task' | 'event'; id: string };

export const remindersKey = (source: ReminderSource) =>
  ['reminders', source.kind, source.id] as const;
export const missedKey = ['reminders', 'missed'] as const;

export function useReminders(source: ReminderSource) {
  return useQuery({
    queryKey: remindersKey(source),
    queryFn: () =>
      source.kind === 'task' ? reminderList(source.id) : reminderList(undefined, source.id),
  });
}

export function useSetReminder(source: ReminderSource) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (input: ReminderSet) => reminderSet(input),
    onError: (e) => toast.error(t('rem.saveError'), { description: errorMessage(e) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      void qc.invalidateQueries({ queryKey: ['task', source.id] });
    },
  });
}

export function useDeleteReminder(source: ReminderSource) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (id: string) => reminderDelete(id),
    onError: (e) => toast.error(t('rem.saveError'), { description: errorMessage(e) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      void qc.invalidateQueries({ queryKey: ['task', source.id] });
    },
  });
}

export function useMissedReminders() {
  return useQuery({ queryKey: missedKey, queryFn: reminderMissedList });
}

export function useDismissReminder() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? reminderDismissAll() : reminderDismiss(id)),
    onError: (e) => toast.error(t('common.error'), { description: errorMessage(e) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['reminders'] }),
  });
}
