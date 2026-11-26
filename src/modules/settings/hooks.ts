import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage, settingsGet, settingsUpdate } from '@/lib/ipc/commands';
import type { AppSettings, SettingsPatch } from '@/lib/ipc/contract';

export const SETTINGS_KEY = ['settings'] as const;

export function useSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: settingsGet, staleTime: 60_000 });
}

/** Đổi settings kiểu optimistic: lỗi thì rollback và hiện toast. */
export function useUpdateSettings(errorTitle: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => settingsUpdate(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY });
      const previous = qc.getQueryData<AppSettings>(SETTINGS_KEY);
      if (previous) qc.setQueryData<AppSettings>(SETTINGS_KEY, { ...previous, ...patch });
      return { previous };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(SETTINGS_KEY, ctx.previous);
      toast.error(errorTitle, { description: errorMessage(err) });
    },
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  });
}
