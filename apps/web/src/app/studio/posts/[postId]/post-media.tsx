'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useState } from 'react';
import {
  createMediaUploadSchema,
  errorResponseSchema,
  mediaUploadResponseSchema,
  mediaKindOf,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  POST_MEDIA_MAX_PER_POST,
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_MAX_DURATION_SECONDS,
  POST_VIDEO_TYPES,
  type StudioMedia,
  studioMediaSchema,
} from '@influency/shared';
import { Button } from '@/components/ui/button';

const UPLOAD_FAILED = 'Gagal mengunggah. Coba lagi.';

/** Message from an API error body, or the generic upload failure. */
async function apiMessage(res: Response): Promise<string> {
  const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : UPLOAD_FAILED;
}

/** `m:ss` for a video duration. */
const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Images and videos of a draft: slot from the API → upload straight to storage / the video provider → complete
 * (the API checks the bytes or asks the provider). Type/size checks here are UX only. While a video is processing,
 * the page refreshes every 5 s.
 */
/** `locked`: the post is live, so media can't change until it is hidden (the API enforces this too). */
export function PostMedia({
  postId,
  media,
  locked = false,
}: {
  postId: string;
  media: StudioMedia[];
  locked?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>();
  const [pending, setPending] = useState(false);
  const base = `/api/v1/creators/me/posts/${postId}/media`;
  const full = media.length >= POST_MEDIA_MAX_PER_POST;
  const processing = media.some((item) => item.status === 'PROCESSING');

  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [processing, router]);

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
    const video = mediaKindOf(check.data.contentType) === 'VIDEO';
    setPending(true);
    setStatus(video ? 'Mengunggah video… (jangan tutup halaman)' : 'Mengunggah…');
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
      // Presigned PUT (R2 / local dev, which carries its own token) or Stream's one-time multipart POST: no credentials.
      let body: BodyInit = file;
      if (target.method === 'POST') {
        const form = new FormData();
        form.append(target.formField ?? 'file', file);
        body = form;
      }
      const put = await fetch(target.url, {
        method: target.method,
        headers: target.headers,
        body,
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
      const completed = studioMediaSchema.safeParse(await done.json().catch(() => null));
      setStatus(
        completed.success && completed.data.status === 'PROCESSING'
          ? 'Video sedang diproses…'
          : undefined,
      );
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
    <section className="flex flex-col gap-3" aria-labelledby="post-media-heading">
      <h2 id="post-media-heading" className="text-lg font-semibold">
        Media
      </h2>
      {media.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item, index) => (
            <li key={item.id} className="flex flex-col gap-1">
              {item.kind === 'VIDEO' ? (
                // No player until signed playback exists (US-021); status is text, not just color.
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border bg-muted text-sm">
                  <span className="font-medium">Video {index + 1}</span>
                  <span className="text-muted-foreground">
                    {item.status === 'PROCESSING'
                      ? 'Memproses…'
                      : `Siap${item.durationSeconds === null ? '' : ` · ${formatDuration(item.durationSeconds)}`}`}
                  </span>
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element -- private same-origin API image; next/image would proxy/cache it */
                <img
                  src={`${base}/${item.id}/content`}
                  alt={`Gambar ${index + 1}`}
                  className="aspect-square w-full rounded-md border object-cover"
                />
              )}
              {!locked && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => void remove(item.id)}
                  aria-label={`Hapus ${item.kind === 'VIDEO' ? 'video' : 'gambar'} ${index + 1}`}
                >
                  Hapus
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {locked ? (
        <p className="text-sm text-muted-foreground">Sembunyikan post dulu untuk mengubah media.</p>
      ) : (
        <>
          <label htmlFor="post-media-file" className="text-sm font-medium">
            Tambah gambar atau video
          </label>
          <input
            id="post-media-file"
            type="file"
            accept={[...POST_IMAGE_TYPES, ...POST_VIDEO_TYPES].join(',')}
            disabled={pending || full}
            onChange={(e) => void upload(e)}
            aria-describedby="post-media-hint post-media-status"
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
          />
          <p id="post-media-hint" className="text-sm text-muted-foreground">
            Gambar JPEG, PNG, atau WebP, maks. {POST_IMAGE_MAX_BYTES / 1024 / 1024} MB · Video MP4,
            MOV, atau WebM, maks. {POST_VIDEO_MAX_BYTES / 1024 / 1024} MB,{' '}
            {POST_VIDEO_MAX_DURATION_SECONDS / 60} menit · {media.length}/{POST_MEDIA_MAX_PER_POST}
          </p>
        </>
      )}
      <p id="post-media-status" aria-live="polite" className="text-sm">
        {status}
      </p>
    </section>
  );
}
