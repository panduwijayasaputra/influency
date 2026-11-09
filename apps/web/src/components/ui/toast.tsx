'use client';

import { Toast } from 'radix-ui';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

export const TOAST_DURATION_MS = 4000;
export const MAX_TOASTS = 3;

const ToastContext = createContext<((message: string) => void) | null>(null);

/** Mounted once in the root layout (US-002). Toasts stack above the bottom nav, are announced politely and never take focus. */
export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  const nextId = useRef(0);
  const toast = useCallback((message: string) => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, message }].slice(-MAX_TOASTS));
  }, []);

  return (
    <Toast.Provider duration={TOAST_DURATION_MS} swipeDirection="down" label="Notifikasi">
      <ToastContext value={toast}>{children}</ToastContext>
      {items.map((t) => (
        <Toast.Root
          key={t.id}
          type="background"
          onOpenChange={(open) => {
            if (!open) setItems((list) => list.filter((x) => x.id !== t.id));
          }}
          className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y) motion-reduce:animate-none"
        >
          <Toast.Title>{t.message}</Toast.Title>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-60 mx-auto flex w-full max-w-feed flex-col gap-2 px-4 outline-none" />
    </Toast.Provider>
  );
}

/** Shows a short confirmation, e.g. `toast('Tautan disalin')`. */
export function useToast(): (message: string) => void {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside <Toaster>');
  return toast;
}
