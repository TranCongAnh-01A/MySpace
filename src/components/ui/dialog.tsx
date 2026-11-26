import type { ComponentProps } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

const overlay = 'fixed inset-0 z-40 bg-black/50';
const panel =
  'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 text-text shadow-xl';

// ---- Dialog ----
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content className={cn(panel, className)} {...props}>
        {children}
        <DialogPrimitive.Close
          aria-label={t('common.close')}
          className="absolute top-3 right-3 rounded p-1 text-muted hover:text-text"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-base font-semibold', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('mt-1 text-muted', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />;
}

// ---- AlertDialog (xác nhận hành động nguy hiểm; Esc/Huỷ là lựa chọn mặc định) ----
export const AlertDialog = AlertPrimitive.Root;
export const AlertDialogTrigger = AlertPrimitive.Trigger;

export function AlertDialogContent({
  className,
  ...props
}: ComponentProps<typeof AlertPrimitive.Content>) {
  return (
    <AlertPrimitive.Portal>
      <AlertPrimitive.Overlay className={overlay} />
      <AlertPrimitive.Content className={cn(panel, className)} {...props} />
    </AlertPrimitive.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertPrimitive.Title>) {
  return <AlertPrimitive.Title className={cn('text-base font-semibold', className)} {...props} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertPrimitive.Description>) {
  return <AlertPrimitive.Description className={cn('mt-1 text-muted', className)} {...props} />;
}

export function AlertDialogCancel({
  className,
  ...props
}: ComponentProps<typeof AlertPrimitive.Cancel>) {
  return (
    <AlertPrimitive.Cancel
      className={cn(buttonVariants({ variant: 'secondary' }), className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  danger,
  ...props
}: ComponentProps<typeof AlertPrimitive.Action> & { danger?: boolean }) {
  return (
    <AlertPrimitive.Action
      className={cn(buttonVariants({ variant: danger ? 'danger' : 'default' }), className)}
      {...props}
    />
  );
}
