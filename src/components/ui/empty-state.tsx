import type { ReactNode } from 'react';
import { Button } from './button';

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="text-muted [&_svg]:size-8">{icon}</div>}
      <p className="font-medium text-text">{title}</p>
      {hint && <p className="max-w-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

/** Error state: thông báo + nút Thử lại. */
export function ErrorState({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string;
  message?: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-lg border border-danger/50 px-6 py-8 text-center"
    >
      <p className="font-medium text-danger">{title}</p>
      {message && <p className="text-muted">{message}</p>}
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
