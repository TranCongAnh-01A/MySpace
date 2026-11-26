import type { ComponentProps } from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as ContextPrimitive from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';

const content =
  'z-50 min-w-40 rounded-md border border-border bg-surface p-1 text-sm text-text shadow-md';
const item =
  'flex cursor-default items-center justify-between gap-4 rounded px-2 py-1.5 outline-none select-none data-[highlighted]:bg-border/70 data-[disabled]:text-muted data-[disabled]:opacity-70';

// ---- Dropdown menu ----
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        className={cn(content, className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Item>) {
  return <DropdownPrimitive.Item className={cn(item, className)} {...props} />;
}

// ---- Context menu (chuột phải) ----
export const ContextMenu = ContextPrimitive.Root;
export const ContextMenuTrigger = ContextPrimitive.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextPrimitive.Content>) {
  return (
    <ContextPrimitive.Portal>
      <ContextPrimitive.Content className={cn(content, className)} {...props} />
    </ContextPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: ComponentProps<typeof ContextPrimitive.Item>) {
  return <ContextPrimitive.Item className={cn(item, className)} {...props} />;
}

export function ContextMenuLabel({
  className,
  ...props
}: ComponentProps<typeof ContextPrimitive.Label>) {
  return (
    <ContextPrimitive.Label
      className={cn('px-2 py-1 text-xs font-medium text-muted', className)}
      {...props}
    />
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextPrimitive.Separator>) {
  return <ContextPrimitive.Separator className={cn('my-1 h-px bg-border', className)} {...props} />;
}
