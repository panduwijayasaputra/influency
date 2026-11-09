'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorResponseSchema, type StudioPost } from '@influency/shared';
import { Button } from '@/components/ui/button';

type Action = 'archive' | 'restore';

const BY_STATUS: Partial<
  Record<StudioPost['status'], { action?: Action; label?: string; notice?: string }>
> = {
  // A draft is published from the editor (Publikasikan), which saves the form first.
  // Also an admin hold (US-042): the creator cannot change it.
  PENDING_REVIEW: { notice: 'Sedang ditinjau admin; tidak terlihat publik.' },
  PUBLISHED: {
    action: 'archive',
    label: 'Arsipkan',
    notice: 'Post tampil di halaman publik Anda.',
  },
  ARCHIVED: {
    action: 'restore',
    label: 'Pulihkan',
    notice:
      'Post diarsipkan: tidak tampil di halaman publik dan tidak bisa dibeli. Media tetap tersimpan.',
  },
  REMOVED: { notice: 'Dihapus oleh admin karena melanggar aturan. Tidak terlihat publik.' },
};

/** Archive a published post or restore an archived one (drafts are published from the editor). The API decides whether that is allowed. */
export function PostStatusActions({ post }: { post: StudioPost }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const entry = BY_STATUS[post.status];
  if (!entry) return null;
  const { action, label, notice } = entry;

  async function run(which: Action) {
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch(`/api/v1/creators/me/posts/${post.id}/${which}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        router.refresh();
      } else {
        setError(errorResponseSchema.parse(await res.json()).error.message);
      }
    } catch {
      setError('Gagal mengubah status post. Silakan coba lagi.');
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {action && (
        <Button
          type="button"
          variant={action === 'archive' ? 'outline' : 'default'}
          disabled={pending}
          onClick={() => void run(action)}
          className="self-start"
        >
          {label}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
