import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted disabled:opacity-50 aria-invalid:border-danger';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input type={type} autoComplete="off" className={cn(field, 'h-9', className)} {...props} />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      autoComplete="off"
      className={cn(field, 'min-h-20 resize-y py-2', className)}
      {...props}
    />
  );
}
