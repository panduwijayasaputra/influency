'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorResponseSchema, isPostEditable, type StudioPost } from '@influency/shared';
import { Button } from '@/components/ui/button';

const LIVE_NOTICE: Partial<Record<StudioPost['status'], string>> = {
  PUBLISHED: 'Post tampil di halaman publik Anda.',
  PENDING_REVIEW: 'Menunggu tinjauan admin sebelum tampil.',
};

/** Publish a draft/hidden post or hide a live one. The API decides whether that is allowed. */
export function PostStatusActions({ post }: { post: StudioPost }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const notice = LIVE_NOTICE[post.status];
  const action = isPostEditable(post.status) ? 'publish' : notice ? 'hide' : null;
  if (!action) return null;

  async function run(which: 'publish' | 'hide') {
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
      <Button
        type="button"
        variant={action === 'hide' ? 'outline' : 'default'}
        disabled={pending}
        onClick={() => void run(action)}
        className="self-start"
      >
        {action === 'publish' ? 'Publikasikan' : 'Sembunyikan'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
