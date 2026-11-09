'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createMediaUploadSchema,
  errorResponseSchema,
  mediaKindOf,
  mediaUploadResponseSchema,
  POST_MEDIA_MAX_PER_POST,
  type StudioMedia,
  studioMediaListSchema,
  studioMediaSchema,
} from '@influency/shared';
import { ApiError } from '@/lib/api/errors';

const UPLOAD_FAILED = 'Gagal mengunggah. Coba lagi.';
const POLL_MS = 5000;

/** Message from an API error body, or `fallback`. */
async function apiMessage(res: Response, fallback = UPLOAD_FAILED): Promise<string> {
  const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : fallback;
}

/** Items that count toward the per-post limit (failed ones don't; the API agrees). */
export const activeMediaCount = (items: StudioMedia[]) =>
  items.filter((item) => item.status !== 'REJECTED').length;

/**
 * Media of one post, kept in the creator's order. Upload = slot from the API → PUT straight to storage / the video
 * provider → complete (the API checks the bytes or asks the provider). Type/size checks here are UX only.
 * `getPostId` creates the draft on the first add, so opening the form creates nothing. While a video is processing,
 * the list is re-checked every 5 s. `locked`: the post is live, so only failed items can still be removed.
 */
export function usePostMedia({
  getPostId,
  initialPostId = null,
  initial,
  locked,
}: {
  getPostId: () => Promise<string>;
  /** Set in edit mode; null until the first add creates the draft. */
  initialPostId?: string | null;
  initial: StudioMedia[];
  locked: boolean;
}) {
  const [items, setItems] = useState<StudioMedia[]>(initial);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const postId = useRef<string | null>(initialPostId);
  const processing = items.some((item) => item.status === 'PROCESSING');

  const base = (id: string) => `/api/v1/creators/me/posts/${id}/media`;

  // Re-check PROCESSING videos; keeps the local order and only takes over the status fields.
  useEffect(() => {
    if (!processing || !postId.current) return;
    const id = postId.current;
    const timer = setInterval(() => {
      void fetch(base(id), { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          const list = studioMediaListSchema.safeParse(body);
          if (!list.success) return;
          const fresh = new Map(list.data.media.map((m) => [m.id, m]));
          setItems((current) => current.map((m) => fresh.get(m.id) ?? m));
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [processing]);

  const patch = useCallback((id: string, change: Partial<StudioMedia>) => {
    setItems((current) => current.map((m) => (m.id === id ? { ...m, ...change } : m)));
  }, []);

  async function add(file: File): Promise<void> {
    if (locked) return;
    if (activeMediaCount(items) >= POST_MEDIA_MAX_PER_POST) {
      setError(`Maksimal ${POST_MEDIA_MAX_PER_POST} foto atau video per post.`);
      return;
    }
    const check = createMediaUploadSchema.safeParse({
      contentType: file.type,
      byteSize: file.size,
    });
    if (!check.success) {
      setError(check.error.issues[0]?.message);
      return;
    }
    const video = mediaKindOf(check.data.contentType) === 'VIDEO';
    setPending(true);
    setError(undefined);
    let slotId: string | undefined;
    try {
      const id = await getPostId();
      postId.current = id;
      const slot = await fetch(base(id), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(check.data),
      });
      if (!slot.ok) {
        setError(await apiMessage(slot));
        return;
      }
      const { media: item, upload: target } = mediaUploadResponseSchema.parse(await slot.json());
      slotId = item.id;
      setItems((current) => [...current, item]);
      // Presigned PUT (R2 / local dev, which carries its own token) or Stream's one-time multipart POST: no credentials.
      let body: BodyInit = file;
      if (target.method === 'POST') {
        const form = new FormData();
        form.append(target.formField ?? 'file', file);
        body = form;
      }
      const put = await fetch(target.url, { method: target.method, headers: target.headers, body });
      if (!put.ok) throw new Error(UPLOAD_FAILED);
      const done = await fetch(`${base(id)}/${item.id}/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!done.ok) {
        const message = await apiMessage(done);
        patch(item.id, { status: 'REJECTED' });
        setError(message);
        return;
      }
      const completed = studioMediaSchema.safeParse(await done.json().catch(() => null));
      if (completed.success) patch(item.id, completed.data);
      if (video && completed.success && completed.data.status === 'PROCESSING') {
        setError(undefined);
      }
    } catch (err) {
      if (slotId) patch(slotId, { status: 'REJECTED' });
      setError(err instanceof ApiError ? err.message : UPLOAD_FAILED);
    } finally {
      setPending(false);
    }
  }

  async function remove(mediaId: string): Promise<void> {
    const item = items.find((m) => m.id === mediaId);
    // Failed items can be removed even from a live post: viewers never see them.
    if (!item || (locked && item.status !== 'REJECTED') || !postId.current) return;
    setPending(true);
    setError(undefined);
    try {
      const res = await fetch(`${base(postId.current)}/${mediaId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) setItems((current) => current.filter((m) => m.id !== mediaId));
      else setError(await apiMessage(res, 'Gagal menghapus. Coba lagi.'));
    } catch {
      setError('Gagal menghapus. Coba lagi.');
    } finally {
      setPending(false);
    }
  }

  function move(from: number, to: number): void {
    if (locked || to < 0 || to >= items.length || from === to) return;
    setItems((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }

  return { items, error, pending, add, remove, move, setError };
}
