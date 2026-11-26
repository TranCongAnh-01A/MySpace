// Hàng đợi lưu Note: hàm thuần (không React), dùng được với timer giả trong test.

export type SavePayload = { title: string; contentJson: string };
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
export type SaveSnapshot = { status: SaveStatus; savedAt: Date | null; retriesLeft: number };

type Options = {
  save: (payload: SavePayload, baseVersion: number) => Promise<{ version: number }>;
  isConflict: (e: unknown) => boolean;
  version: number;
  debounceMs?: number;
  retryMs?: number;
  maxRetries?: number;
  now?: () => Date;
};

export type SaveQueue = ReturnType<typeof createSaveQueue>;

/**
 * - Lưu sau `debounceMs` không gõ; `flush()` lưu ngay.
 * - Mỗi lúc chỉ một lần lưu; thay đổi mới trong lúc lưu thì xếp hàng một lần nữa, dùng version của lần trước.
 * - Lỗi: giữ nguyên nội dung, thử lại sau `retryMs` tối đa `maxRetries` lần.
 * - `CONFLICT`: dừng, chờ `resolveKeepMine(version)` hoặc `resolveUseSaved()`.
 */
export function createSaveQueue(opts: Options) {
  const debounceMs = opts.debounceMs ?? 1000;
  const retryMs = opts.retryMs ?? 5000;
  const maxRetries = opts.maxRetries ?? 3;
  const now = opts.now ?? (() => new Date());

  let version = opts.version;
  let pending: SavePayload | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;
  let snap: SaveSnapshot = { status: 'idle', savedAt: null, retriesLeft: maxRetries };
  const listeners = new Set<() => void>();

  const set = (patch: Partial<SaveSnapshot>) => {
    snap = { ...snap, ...patch };
    listeners.forEach((l) => l());
  };
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  async function run(): Promise<void> {
    if (inFlight) return inFlight;
    if (!pending || snap.status === 'conflict') return;
    clearTimer();
    const payload = pending;
    pending = null;
    set({ status: 'saving' });
    inFlight = (async () => {
      try {
        const res = await opts.save(payload, version);
        version = res.version;
        retries = 0;
        if (pending) {
          inFlight = null;
          await run();
          return;
        }
        set({ status: 'saved', savedAt: now(), retriesLeft: maxRetries });
      } catch (e) {
        pending = pending ?? payload; // nội dung mới hơn (nếu có) thắng, không thì giữ bản vừa gửi
        if (opts.isConflict(e)) {
          set({ status: 'conflict' });
        } else {
          retries += 1;
          set({ status: 'error', retriesLeft: Math.max(0, maxRetries - retries) });
          if (retries <= maxRetries) timer = setTimeout(() => void run(), retryMs);
        }
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    get snapshot() {
      return snap;
    },
    get version() {
      return version;
    },
    hasUnsaved: () => pending !== null || inFlight !== null,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /** Có nội dung mới: lưu sau `debounceMs`. */
    schedule(payload: SavePayload) {
      pending = payload;
      if (snap.status === 'conflict') return;
      if (snap.status !== 'saving') set({ status: 'dirty' });
      clearTimer();
      if (!inFlight) timer = setTimeout(() => void run(), debounceMs);
    },
    /** Lưu ngay; xong khi không còn gì chờ (hoặc đang lỗi/xung đột). */
    async flush(): Promise<void> {
      clearTimer();
      while (inFlight || (pending && snap.status !== 'conflict' && snap.status !== 'error')) {
        if (inFlight) await inFlight;
        else await run();
      }
      if (pending && snap.status === 'error') await run();
    },
    /** Nút "Thử lại". */
    async retry(): Promise<void> {
      retries = 0;
      set({ retriesLeft: maxRetries });
      await run();
    },
    /** "Giữ bản của tôi": version mới lấy từ `note_get`, rồi lưu đè. */
    async resolveKeepMine(freshVersion: number): Promise<void> {
      version = freshVersion;
      retries = 0;
      set({ status: pending ? 'dirty' : 'idle' });
      await run();
    },
    /** "Dùng bản đã lưu": bỏ thay đổi đang có. */
    resolveUseSaved(freshVersion: number) {
      clearTimer();
      version = freshVersion;
      pending = null;
      retries = 0;
      set({ status: 'idle', retriesLeft: maxRetries });
    },
    dispose() {
      clearTimer();
      listeners.clear();
    },
  };
}

/** Mọi hàng đợi đang sống, để `app-will-quit` lưu hết rồi mới báo `app_quit_ready`. */
const registry = new Set<SaveQueue>();
export function registerQueue(q: SaveQueue): () => void {
  registry.add(q);
  return () => {
    // Giữ lại nếu còn nội dung chưa lưu: để flushAllQueues vẫn thấy.
    if (!q.hasUnsaved()) registry.delete(q);
    else void q.flush().finally(() => registry.delete(q));
  };
}
export async function flushAllQueues(): Promise<void> {
  await Promise.all([...registry].map((q) => q.flush()));
}
