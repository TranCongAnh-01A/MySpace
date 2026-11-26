import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inboxCreate, inboxList } from '@/lib/ipc/commands';

export const INBOX_OPEN_KEY = ['inbox', 'Open'] as const;

export function useInboxOpen() {
  return useQuery({ queryKey: INBOX_OPEN_KEY, queryFn: () => inboxList('Open') });
}

export function useCreateInbox(onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => inboxCreate(content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      onSuccess?.();
    },
  });
}
