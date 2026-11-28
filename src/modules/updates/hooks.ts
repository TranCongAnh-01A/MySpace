import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appInfo } from '@/lib/ipc/commands';
import { realDeps } from './deps';
import { useUpdateStore } from './store';

/** Chờ khoảng này sau khi mở app rồi mới kiểm tra, để không tranh việc với lúc khởi động. */
export const STARTUP_CHECK_DELAY_MS = 10_000;

/** Tự kiểm tra một lần lúc khởi động, chỉ khi core cho phép (bản release). Lỗi thì im lặng. */
export function useStartupUpdateCheck() {
  const { data } = useQuery({ queryKey: ['appinfo'], queryFn: appInfo, staleTime: Infinity });
  const allowed = data?.autoUpdateCheck === true;
  useEffect(() => {
    if (!allowed) return;
    const timer = setTimeout(
      () => void useUpdateStore.getState().check(realDeps, { silent: true }),
      STARTUP_CHECK_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [allowed]);
}
