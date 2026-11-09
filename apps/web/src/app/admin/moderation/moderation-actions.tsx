'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  errorResponseSchema,
  MODERATION_NOTE_MAX_LENGTH,
  type PostStatus,
  type UserStatus,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  postId: string;
  postStatus: PostStatus;
  creatorUserId: string;
  creatorStatus: UserStatus;
};

type Action = {
  label: string;
  path: string;
  confirm?: string;
  variant?: 'outline' | 'destructive';
};

/** Buttons valid for the current status. The API enforces AdminGuard and every transition rule. */
function actionsFor({ postId, postStatus, creatorUserId, creatorStatus }: Props): Action[] {
  const post = (a: string) => `/api/v1/admin/moderation/posts/${postId}/${a}`;
  const user = (a: string) => `/api/v1/admin/users/${creatorUserId}/${a}`;
  const all: (Action | false)[] = [
    { label: 'Abaikan', path: post('dismiss'), variant: 'outline' },
    postStatus === 'PUBLISHED' && { label: 'Sembunyikan', path: post('hide') },
    postStatus === 'PENDING_REVIEW' && { label: 'Tampilkan lagi', path: post('unhide') },
    postStatus !== 'REMOVED' && {
      label: 'Hapus',
      path: post('remove'),
      variant: 'destructive',
      confirm: 'Hapus postingan ini? Tindakan ini tidak bisa dibatalkan.',
    },
    creatorStatus === 'ACTIVE'
      ? {
          label: 'Tangguhkan kreator',
          path: user('suspend'),
          variant: 'destructive',
          confirm:
            'Tangguhkan akun kreator ini? Halaman dan semua postingannya akan disembunyikan.',
        }
      : { label: 'Pulihkan akun', path: user('unsuspend'), variant: 'outline' },
  ];
  return all.filter((a) => a !== false);
}

export function ModerationActions(props: Props) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function run(action: Action) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch(action.path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(note.trim() ? { note } : {}),
      });
      if (res.ok) {
        setNote('');
        router.refresh();
      } else {
        const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
        setError(parsed.success ? parsed.data.error.message : 'Gagal menyimpan. Coba lagi.');
        // Someone else may have acted first: show the current state.
        router.refresh();
      }
    } catch {
      setError('Gagal menyimpan. Coba lagi.');
    }
    setPending(false);
  }

  const noteId = `note-${props.postId}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={noteId}>Catatan (internal, opsional)</Label>
      <Input
        id={noteId}
        value={note}
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {actionsFor(props).map((a) => (
          <Button
            key={a.label}
            size="sm"
            variant={a.variant}
            disabled={pending}
            onClick={() => void run(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
