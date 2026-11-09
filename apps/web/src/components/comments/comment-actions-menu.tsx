'use client';

import { Ellipsis } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { type Ref, useRef } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  authorName: string;
  /** A reply: wording changes and pinning is never offered. */
  reply: boolean;
  /** Server flags for this viewer; the menu never guesses from roles. */
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  pinned: boolean;
  /** A request is running. */
  disabled?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
};

const PILL =
  'flex h-9 cursor-pointer items-center rounded-[10px] px-3 text-[13px] font-bold outline-none data-highlighted:ring-2 data-highlighted:ring-ring';

/** The `···` menu of a comment or reply (US-016): shows only the actions the server allows, none = no trigger. */
export function CommentActionsMenu({
  authorName,
  reply,
  canEdit,
  canDelete,
  canPin,
  pinned,
  disabled,
  triggerRef,
  onEdit,
  onDelete,
  onPin,
}: Props) {
  const lastAction = useRef<'edit' | 'other'>('other');
  const showPin = canPin && !reply;
  if (!canEdit && !canDelete && !showPin) return null;
  const noun = reply ? 'balasan' : 'komentar';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={`Aksi lainnya untuk ${noun} ${authorName}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 data-[state=open]:bg-muted"
        >
          <Ellipsis aria-hidden className="size-4.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="start"
          sideOffset={4}
          loop
          aria-label={`Aksi ${noun}`}
          // The editor takes focus after Edit; every other action returns it to the trigger.
          onCloseAutoFocus={(e) => {
            if (lastAction.current === 'edit') e.preventDefault();
            lastAction.current = 'other';
          }}
          className="z-60 flex flex-wrap gap-1.5 rounded-xl bg-card p-1.5 shadow-md"
        >
          {canEdit && (
            <DropdownMenu.Item
              onSelect={() => {
                lastAction.current = 'edit';
                onEdit();
              }}
              className={cn(PILL, 'bg-muted text-foreground')}
            >
              Edit
            </DropdownMenu.Item>
          )}
          {canDelete && (
            <DropdownMenu.Item
              onSelect={onDelete}
              className={cn(PILL, 'bg-destructive/10 text-destructive')}
            >
              Hapus
            </DropdownMenu.Item>
          )}
          {showPin && (
            <DropdownMenu.Item onSelect={onPin} className={cn(PILL, 'bg-muted text-foreground')}>
              {pinned ? 'Lepas sematan' : 'Sematkan'}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
