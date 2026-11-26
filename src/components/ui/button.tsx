import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap select-none transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-fg hover:opacity-90',
        secondary: 'border border-border bg-surface text-text hover:bg-border/60',
        ghost: 'text-text hover:bg-border/60',
        danger: 'bg-danger text-danger-fg hover:opacity-90',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      {...(asChild ? {} : { type })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
