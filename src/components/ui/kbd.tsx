import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 items-center rounded border border-border bg-bg px-1.5 font-sans text-xs font-medium text-muted',
        className,
      )}
      {...props}
    />
  );
}
