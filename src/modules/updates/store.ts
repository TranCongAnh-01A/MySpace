import { create } from 'zustand';
import { errorMessage } from '@/lib/ipc/commands';
import { checkForUpdate, installUpdate, type UpdateHandle, type UpdaterDeps } from './updater';

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'installing' | 'error';

type UpdateState = {
  status: UpdateStatus;
  update: UpdateHandle | null;
  /** Phần trăm tải; `null` khi chưa biết. */
  progress: number | null;
  error: string | null;
  /** Lỗi xảy ra ở bước nào: để nút "Thử lại" chạy lại đúng bước. */
  errorStage: 'check' | 'install' | null;
  /** "Để sau": ẩn dialog trong phiên chạy này. */
  dismissed: boolean;
  /** `silent`: kiểm tra lúc khởi động, lỗi chỉ ghi log. Không silent: do người dùng bấm nút. */
  check: (deps: UpdaterDeps, opts?: { silent?: boolean }) => Promise<void>;
  install: (deps: UpdaterDeps) => Promise<void>;
  dismiss: () => void;
};

const initial = {
  status: 'idle' as UpdateStatus,
  update: null,
  progress: null,
  error: null,
  errorStage: null,
  dismissed: false,
};

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  ...initial,
  async check(deps, opts) {
    if (get().status === 'checking' || get().status === 'installing') return;
    set({ status: 'checking', error: null, errorStage: null });
    try {
      const update = await checkForUpdate(deps);
      if (update) set({ status: 'available', update, dismissed: false });
      else set({ status: 'none', update: null });
    } catch (e) {
      console.info('[updater] không kiểm tra được cập nhật:', errorMessage(e));
      if (opts?.silent) set({ status: 'idle' });
      else set({ status: 'error', error: errorMessage(e), errorStage: 'check' });
    }
  },
  async install(deps) {
    const { update, status } = get();
    if (!update || status === 'installing') return;
    set({ status: 'installing', progress: null, error: null, errorStage: null });
    try {
      await installUpdate(update, deps, (progress) => set({ progress }));
    } catch (e) {
      set({ status: 'error', error: errorMessage(e), errorStage: 'install' });
    }
  },
  dismiss: () => set({ dismissed: true }),
}));

export function resetUpdateStore() {
  useUpdateStore.setState({ ...initial });
}
