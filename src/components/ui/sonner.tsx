import { Toaster as Sonner } from 'sonner';

/** Toast: màu theo token, không phụ thuộc theme của sonner. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
        },
      }}
    />
  );
}
