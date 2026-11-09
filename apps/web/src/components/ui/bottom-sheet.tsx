'use client';

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { pauseAllVideos } from '@/lib/video-playback';

/** A downward drag on the header past this distance, or faster than this (px/ms), closes the sheet. */
export const SWIPE_CLOSE_PX = 80;
export const SWIPE_CLOSE_VELOCITY = 0.5;

type BottomSheetProps = {
  /** Accessible name; always required. Rendered visibly unless hideTitle. */
  title: string;
  hideTitle?: boolean;
  /** Small muted line above the title. */
  eyebrow?: ReactNode;
  /** Visible description under the title; without it no aria-describedby is set. */
  description?: ReactNode;
  /** Uncontrolled usage: the element that opens the sheet. */
  trigger?: ReactNode;
  /** Controlled usage when `open` is given. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Call e.preventDefault() to take over focus return. */
  onCloseAutoFocus?: (e: Event) => void;
  /** Extra classes for the sheet panel (e.g. a fixed height). */
  className?: string;
  children: ReactNode;
};

/** The one sheet for user-facing pages (US-002): Radix Dialog + handle, swipe-down, keyboard inset. */
export function BottomSheet({
  title,
  hideTitle,
  eyebrow,
  description,
  trigger,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
  className,
  children,
}: BottomSheetProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };
  const inset = useKeyboardInset(open);
  // Media pauses under a sheet (spec §6.3).
  useEffect(() => {
    if (open) pauseAllVideos();
  }, [open]);
  const returnFocusRef = useRef<Element | null>(null);
  const [drag, setDrag] = useState<{ y: number; t: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    const dy = Math.max(0, e.clientY - drag.y);
    const velocity = dy / (e.timeStamp - drag.t || 1);
    setDrag(null);
    setDragY(0);
    if (dy > SWIPE_CLOSE_PX || velocity > SWIPE_CLOSE_VELOCITY) setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="bottom-sheet-overlay"
          className="fixed inset-0 z-50 bg-black/55 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement;
          }}
          onCloseAutoFocus={(e) => {
            onCloseAutoFocus?.(e);
            // Radix refocuses a Dialog.Trigger; controlled sheets without one need this.
            if (e.defaultPrevented || trigger) return;
            e.preventDefault();
            (returnFocusRef.current as HTMLElement | null)?.focus?.();
          }}
          style={{
            bottom: inset,
            maxHeight: `calc(90dvh - ${inset}px)`,
            transform: dragY ? `translateY(${dragY}px)` : undefined,
          }}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-feed flex-col rounded-t-3xl bg-card duration-200 focus:outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom motion-reduce:animate-none',
            drag ? 'transition-none' : 'transition-transform motion-reduce:transition-none',
            className,
          )}
        >
          <div
            data-testid="bottom-sheet-header"
            className="flex touch-none flex-col gap-2 px-5 pt-3 select-none"
            onPointerDown={(e) => {
              // Capturing a press on Tutup would retarget its click to the header, so buttons never start a drag.
              if (e.button !== 0 || (e.target as Element).closest('button')) return;
              setDrag({ y: e.clientY, t: e.timeStamp });
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag) setDragY(Math.max(0, e.clientY - drag.y));
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div aria-hidden className="h-1.5 w-10 self-center rounded-full bg-border" />
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {eyebrow && <p className="text-xs font-bold text-muted-foreground">{eyebrow}</p>}
                <Dialog.Title
                  className={cn(
                    'text-lg leading-snug font-extrabold wrap-break-word',
                    hideTitle && 'sr-only',
                  )}
                >
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="text-sm text-muted-foreground">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Tutup" className="-mr-2">
                  <X aria-hidden className="size-5" />
                </Button>
              </Dialog.Close>
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-2 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
