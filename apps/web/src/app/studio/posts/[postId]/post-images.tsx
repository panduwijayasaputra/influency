'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useState } from 'react';
import {
  createMediaUploadSchema,
  errorResponseSchema,
  mediaUploadResponseSchema,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  POST_MEDIA_MAX_PER_POST,
  type StudioMedia,
} from '@influency/shared';
import { Button } from '@/components/ui/button';

const UPLOAD_FAILED = 'Gagal mengunggah. Coba lagi.';

/** Message from an API error body, or the generic upload failure. */
async function apiMessage(res: Response): Promise<string> {
  const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : UPLOAD_FAILED;
}

/**
 * Images of a draft: slot from the API → PUT straight to private storage → complete (the API checks the bytes).
 * Type/size checks here are UX only.
 */
export function PostImages({ postId, media }: { postId: string; media: StudioMedia[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>();
  const [pending, setPending] = useState(false);
  const base = `/api/v1/creators/me/posts/${postId}/media`;
  const full = media.length >= POST_MEDIA_MAX_PER_POST;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const check = createMediaUploadSchema.safeParse({
      contentType: file.type,
      byteSize: file.size,
    });
    if (!check.success) {
      setStatus(check.error.issues[0]?.message);
      input.value = '';
      return;
    }
    setPending(true);
    setStatus('Mengunggah…');
    try {
      const slot = await fetch(base, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(check.data),
      });
      if (!slot.ok) {
        setStatus(await apiMessage(slot));
        return;
      }
      const { media: item, upload: target } = mediaUploadResponseSchema.parse(await slot.json());
      // Presigned URL: no credentials for R2; the same-origin local-dev URL carries its own token.
      const put = await fetch(target.url, {
        method: target.method,
        headers: target.headers,
        body: file,
      });
      if (!put.ok) {
        setStatus(UPLOAD_FAILED);
        return;
      }
      const done = await fetch(`${base}/${item.id}/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!done.ok) {
        setStatus(await apiMessage(done));
        return;
      }
      setStatus(undefined);
      router.refresh();
    } catch {
      setStatus(UPLOAD_FAILED);
    } finally {
      input.value = '';
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      const res = await fetch(`${base}/${id}`, { method: 'DELETE', credentials: 'include' });
      setStatus(res.ok ? undefined : await apiMessage(res));
      if (res.ok) router.refresh();
    } catch {
      setStatus('Gagal menghapus. Coba lagi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="post-images-heading">
      <h2 id="post-images-heading" className="text-lg font-semibold">
        Gambar
      </h2>
      {media.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item, index) => (
            <li key={item.id} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- private same-origin API image; next/image would proxy/cache it */}
              <img
                src={`${base}/${item.id}/content`}
                alt={`Gambar ${index + 1}`}
                className="aspect-square w-full rounded-md border object-cover"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void remove(item.id)}
                aria-label={`Hapus gambar ${index + 1}`}
              >
                Hapus
              </Button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="post-image-file" className="text-sm font-medium">
        Tambah gambar
      </label>
      <input
        id="post-image-file"
        type="file"
        accept={POST_IMAGE_TYPES.join(',')}
        disabled={pending || full}
        onChange={(e) => void upload(e)}
        aria-describedby="post-image-hint post-image-status"
        className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
      />
      <p id="post-image-hint" className="text-sm text-muted-foreground">
        JPEG, PNG, atau WebP, maks. {POST_IMAGE_MAX_BYTES / 1024 / 1024} MB · {media.length}/
        {POST_MEDIA_MAX_PER_POST}
      </p>
      <p id="post-image-status" aria-live="polite" className="text-sm">
        {status}
      </p>
    </section>
  );
}
