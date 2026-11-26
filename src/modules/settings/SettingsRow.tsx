import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** Một dòng cài đặt: nhãn (+ mô tả) bên trái, control bên phải. */
export function SettingsRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p id={`${id}-hint`} className="mt-0.5 text-muted">
            {hint}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
