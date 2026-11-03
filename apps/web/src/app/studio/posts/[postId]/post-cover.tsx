'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useState } from 'react';
import {
  errorResponseSchema,
  POST_COVER_MAX_BYTES,
  POST_IMAGE_TYPES,
  type PostCover as Cover,
} from '@influency/shared';
import { Button } from '@/components/ui/button';

const FAILED = 'Gagal menyimpan sampul. Coba lagi.';

async function apiMessage(res: Response): Promise<string> {
  const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : FAILED;
}

/**
 * Cover of a premium post (US-048). The server stores only a generated preview; this shows exactly what visitors see.
 * A post image or video can also be chosen from the Media section. Allowed in any post status.
 */
export function PostCover({ postId, cover }: { postId: string; cover: Cover | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>();
  const [pending, setPending] = useState(false);
  const base = `/api/v1/creators/me/posts/${postId}/cover`;

  async function send(url: string, init: RequestInit, done: string) {
    setPending(true);
    setStatus(undefined);
    try {
      const res = await fetch(url, { ...init, credentials: 'include' });
      setStatus(res.ok ? done : await apiMessage(res));
      if (res.ok) router.refresh();
    } catch {
      setStatus(FAILED);
    } finally {
      setPending(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // UX only: the API checks the real bytes.
    if (!(POST_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setStatus('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > POST_COVER_MAX_BYTES) {
      setStatus(`Ukuran sampul maksimal ${POST_COVER_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    await send(
      `${base}/image`,
      { method: 'PUT', headers: { 'content-type': file.type }, body: file },
      'Sampul diperbarui.',
    );
  }

  return (
    <section aria-labelledby="cover-heading" className="flex flex-col gap-3">
      <h2 id="cover-heading" className="text-lg font-semibold">
        Sampul
      </h2>
      {cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- private same-origin API image; next/image would proxy/cache it */}
          <img
            src={cover.previewUrl}
            alt="Pratinjau sampul"
            className="aspect-square w-40 rounded-md border object-cover"
          />
          <p className="text-sm text-muted-foreground">
            Ini yang dilihat pengunjung sebelum membuka post.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Belum ada sampul. Pengunjung melihat gambar terkunci.
        </p>
      )}
      <label htmlFor="post-cover-file" className="text-sm font-medium">
        Unggah sampul
      </label>
      <input
        id="post-cover-file"
        type="file"
        accept={POST_IMAGE_TYPES.join(',')}
        disabled={pending}
        onChange={(e) => void upload(e)}
        aria-describedby="post-cover-hint post-cover-status"
        className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
      />
      <p id="post-cover-hint" className="text-sm text-muted-foreground">
        JPEG, PNG, atau WebP, maks. {POST_COVER_MAX_BYTES / 1024 / 1024} MB. Atau pilih
        &quot;Jadikan sampul&quot; pada media di bawah.
      </p>
      {cover && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          className="self-start"
          onClick={() => void send(base, { method: 'DELETE' }, 'Sampul dihapus.')}
        >
          Hapus sampul
        </Button>
      )}
      <p id="post-cover-status" aria-live="polite" className="text-sm">
        {status}
      </p>
    </section>
  );
}
