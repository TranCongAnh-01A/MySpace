import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useT } from '@/lib/i18n';
import { eventToAccelerator, isModifierOnly } from './accelerator';

type Props = {
  id: string;
  value: string;
  /** Gọi khi bấm xong một tổ hợp hợp lệ. Lỗi (CONFLICT…) do cha hiển thị bằng `error`. */
  onRecord: (accelerator: string) => void;
  pending?: boolean;
  error?: string | null;
  describedBy?: string;
};

/** Ô ghi phím tắt: bấm "Đổi phím", nhấn tổ hợp, Esc để huỷ. */
export function ShortcutRecorder({ id, value, onRecord, pending, error, describedBy }: Props) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return;
    // Chặn phím tắt trong app (Ctrl+2…) và hành vi mặc định của nút trong lúc ghi.
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(false);
      setHint(null);
      return;
    }
    if (isModifierOnly(e)) return;
    const accelerator = eventToAccelerator(e.nativeEvent);
    if (!accelerator) {
      setHint(t('system.shortcutNeedModifier'));
      return;
    }
    setRecording(false);
    setHint(null);
    onRecord(accelerator);
  }

  const message = hint ?? error ?? null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Kbd id={`${id}-value`} className="h-8 px-2 text-sm text-text">
          {recording ? t('system.shortcutRecording') : value}
        </Kbd>
        <Button
          id={id}
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-label={`${t('system.shortcutChange')}: ${value}`}
          aria-describedby={describedBy}
          aria-pressed={recording}
          onClick={() => {
            setRecording((r) => !r);
            setHint(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setRecording(false)}
        >
          {t('system.shortcutChange')}
        </Button>
      </div>
      {message && (
        <p role="alert" className="text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
