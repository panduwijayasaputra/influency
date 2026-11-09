'use client';

import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import {
  createPostSchema,
  isPostEditable,
  mediaKindOf,
  POST_CAPTION_MAX_LENGTH,
  POST_IMAGE_TYPES,
  POST_MEDIA_MAX_PER_POST,
  POST_OFFER_MAX_PRICE_COINS,
  POST_OFFER_MIN_PRICE_COINS,
  POST_VIDEO_TYPES,
  type PostVisibility,
  type StudioMedia,
  type StudioPost,
  studioPostSchema,
} from '@influency/shared';
import { SegmentedControl } from '@/components/user-area/segmented-control';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ApiError, sendJson } from '@/lib/api/errors';
import { saveMediaOrder } from '@/lib/api/post-media-order';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MEDIA_REJECTION_FALLBACK, MEDIA_REJECTION_LABELS } from './labels';
import { activeMediaCount, usePostMedia } from './use-post-media';

const PLATFORM_FEE_PERCENT = 20; // LOCKED unlock fee (spec §3); the API owns the real split.
const ACCESS_OPTIONS = [
  { value: 'FREE', label: 'Gratis' },
  { value: 'PREMIUM', label: 'Premium' },
] as const satisfies readonly { value: PostVisibility; label: string }[];

/** A whole-Koin price in the offer range, or null for anything else ("2.5", "abc", "", 4, 1001). */
export function parsePrice(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const n = Number(input.trim());
  return n >= POST_OFFER_MIN_PRICE_COINS && n <= POST_OFFER_MAX_PRICE_COINS ? n : null;
}

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Post Baru / Edit post on one screen. Opening it creates nothing: the draft is created when the first media is added
 * (or on save). Saving runs the existing studio calls in order and stops at the first failure; every step is
 * idempotent, so pressing the button again resumes. The first media item is the cover of a premium post.
 */
export function PostEditor({
  post,
  media: initialMedia = [],
  creatorSlug,
}: {
  post?: StudioPost;
  media?: StudioMedia[];
  creatorSlug: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [postId, setPostId] = useState<string | null>(post?.id ?? null);
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [visibility, setVisibility] = useState<PostVisibility>(post?.visibility ?? 'FREE');
  const [priceInput, setPriceInput] = useState(String(post?.offer?.priceCoins ?? 25));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [selected, setSelected] = useState(0);
  // What the server already has, so a retry only sends what still differs.
  const saved = useRef({
    caption: post?.caption ?? null,
    visibility: post?.visibility ?? null,
    price: post?.offer?.priceCoins ?? null,
    coverMediaId: post?.cover?.mediaId ?? null,
    order: initialMedia.map((m) => m.id).join(','),
  });
  const live = post !== undefined && !isPostEditable(post.status);
  const idRef = useRef(postId);

  async function ensureDraft(): Promise<string> {
    if (idRef.current) return idRef.current;
    const body = createPostSchema.safeParse({ caption, visibility });
    if (!body.success) {
      throw new ApiError('VALIDATION_FAILED', body.error.issues[0]?.message ?? 'Data tidak valid.');
    }
    const created = await sendJson('POST', '/creators/me/posts', studioPostSchema, {
      body: body.data,
    });
    idRef.current = created.id;
    saved.current.caption = created.caption;
    saved.current.visibility = created.visibility;
    setPostId(created.id);
    // Keep the form state: this only updates the address bar so a reload opens the draft.
    window.history.replaceState(null, '', `/studio/posts/${created.id}`);
    return created.id;
  }

  const mediaState = usePostMedia({
    getPostId: ensureDraft,
    initialPostId: post?.id ?? null,
    initial: initialMedia,
    locked: live,
  });
  const { items } = mediaState;
  const active = activeMediaCount(items);
  const full = active >= POST_MEDIA_MAX_PER_POST;
  const sel = Math.min(selected, Math.max(0, items.length - 1));
  const current = items[sel];

  const price = parsePrice(priceInput);
  const premium = visibility === 'PREMIUM';
  const priceError = premium && price === null;
  const captionError = caption.length > POST_CAPTION_MAX_LENGTH;
  const mediaError = tried && active === 0;
  const busy = saving || mediaState.pending;
  const priceChanged =
    live && premium && price !== null && price !== (post?.offer?.priceCoins ?? null);

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (file) {
      void mediaState.add(file).then(() => setSelected(Number.MAX_SAFE_INTEGER));
    }
    input.value = '';
  }

  function move(delta: number) {
    mediaState.move(sel, sel + delta);
    setSelected(sel + delta);
  }

  async function remove() {
    if (current) await mediaState.remove(current.id);
  }

  async function save(publish: boolean) {
    setTried(true);
    setFormError(undefined);
    if (captionError || priceError) return;
    if (publish && active === 0) return;
    setSaving(true);
    try {
      const id = await ensureDraft();
      const base = `/creators/me/posts/${id}`;
      const changes: Record<string, unknown> = {};
      if (caption !== saved.current.caption) changes.caption = caption;
      if (!live && visibility !== saved.current.visibility) changes.visibility = visibility;
      if (Object.keys(changes).length > 0) {
        const updated = await sendJson('PATCH', base, studioPostSchema, { body: changes });
        saved.current.caption = updated.caption;
        saved.current.visibility = updated.visibility;
      }
      const order = items.map((m) => m.id).join(',');
      if (!live && items.length > 1 && order !== saved.current.order) {
        await saveMediaOrder(
          id,
          items.map((m) => m.id),
        );
        saved.current.order = order;
      }
      if (premium && price !== null) {
        if (price !== saved.current.price) {
          await sendJson('PUT', `${base}/offer`, studioPostSchema, {
            body: { priceCoins: price },
          });
          saved.current.price = price;
        }
        const first = items.find((m) => m.status !== 'REJECTED');
        if (first?.status === 'READY' && first.id !== saved.current.coverMediaId) {
          await sendJson('PUT', `${base}/cover`, studioPostSchema, {
            body: { mediaId: first.id },
          });
          saved.current.coverMediaId = first.id;
        }
      }
      if (publish) await sendJson('POST', `${base}/publish`, studioPostSchema);
      toast(publish ? 'Post dipublikasikan' : live ? 'Perubahan disimpan' : 'Draf disimpan');
      router.push(`/${creatorSlug}`);
      return; // keep the buttons disabled while navigating
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'MEDIA_PROCESSING') {
          setFormError('Video masih diproses. Coba lagi sebentar lagi.');
        } else if (err.code === 'MEDIA_REQUIRED') {
          setFormError('Tambahkan minimal 1 foto atau video.');
        } else if (err.code === 'OFFER_REQUIRED') {
          setFormError('Masukkan harga untuk post Premium.');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Gagal menyimpan post. Silakan coba lagi.');
      }
    }
    setSaving(false);
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(!live);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6 pb-28">
      <section aria-labelledby="media-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="media-heading" className="text-base font-bold">
            Media
          </h2>
          <span className="text-sm text-muted-foreground">
            {active} / {POST_MEDIA_MAX_PER_POST}
          </span>
        </div>

        {current && (
          <div className="flex flex-col gap-2">
            <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl border bg-muted">
              {current.status === 'REJECTED' ? (
                <p className="px-6 text-center text-sm">
                  {current.rejectionReason
                    ? MEDIA_REJECTION_LABELS[current.rejectionReason]
                    : MEDIA_REJECTION_FALLBACK}
                </p>
              ) : current.kind === 'VIDEO' || !postId ? (
                <p className="text-sm text-muted-foreground">
                  Video {sel + 1} ·{' '}
                  {current.status === 'READY'
                    ? current.durationSeconds === null
                      ? 'Siap'
                      : `Siap · ${formatDuration(current.durationSeconds)}`
                    : 'Memproses…'}
                </p>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element -- private same-origin API image */
                <img
                  src={`/api/v1/creators/me/posts/${postId}/media/${current.id}/content`}
                  alt={`Pratinjau gambar ${sel + 1}`}
                  className="size-full object-cover"
                />
              )}
              {sel === 0 && current.status !== 'REJECTED' && (
                <span className="absolute top-3 left-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                  Sampul
                </span>
              )}
              <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                {sel + 1} / {items.length}
              </span>
            </div>
            {!live && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || sel === 0}
                  onClick={() => move(-1)}
                  aria-label="Geser kiri"
                  className="flex-1"
                >
                  <ChevronLeft aria-hidden className="size-4" />
                  Geser kiri
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || sel >= items.length - 1}
                  onClick={() => move(1)}
                  aria-label="Geser kanan"
                  className="flex-1"
                >
                  Geser kanan
                  <ChevronRight aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove()}
                  aria-label="Hapus media"
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            )}
            {live && current.status === 'REJECTED' && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
                Hapus media
              </Button>
            )}
          </div>
        )}

        {items.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Daftar media">
            {items.map((item, index) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={index === sel}
                  aria-label={`${item.kind === 'VIDEO' ? 'Video' : 'Gambar'} ${index + 1}${item.status === 'REJECTED' ? ' gagal' : item.status === 'READY' ? '' : ' sedang diproses'}`}
                  onClick={() => setSelected(index)}
                  className={cn(
                    'flex size-16 items-center justify-center overflow-hidden rounded-xl border-2 bg-muted text-xs font-semibold',
                    index === sel ? 'border-primary' : 'border-transparent',
                    item.status === 'REJECTED' && 'border-destructive/60',
                  )}
                >
                  {item.kind === 'IMAGE' && item.status === 'READY' && postId ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- private same-origin API image */
                    <img
                      src={`/api/v1/creators/me/posts/${postId}/media/${item.id}/content`}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span>
                      {item.status === 'REJECTED'
                        ? 'Gagal'
                        : mediaKindOf(item.contentType) === 'VIDEO'
                          ? 'Video'
                          : '…'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {live ? (
          <p className="text-sm text-muted-foreground">
            Media dan akses tidak bisa diubah setelah dipublikasikan.
          </p>
        ) : (
          <>
            <input
              id="post-media-file"
              type="file"
              className="sr-only"
              accept={[...POST_IMAGE_TYPES, ...POST_VIDEO_TYPES].join(',')}
              disabled={busy || full}
              onChange={onPickFile}
            />
            <Label
              htmlFor="post-media-file"
              aria-disabled={busy || full}
              className={cn(
                'flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/60 bg-accent text-sm font-bold text-primary-ink',
                (busy || full) && 'cursor-not-allowed opacity-60',
              )}
            >
              <ImagePlus aria-hidden className="size-5" />
              Tambah foto atau video
            </Label>
            {full && (
              <p className="text-sm text-muted-foreground">
                Maksimal {POST_MEDIA_MAX_PER_POST} foto atau video per post.
              </p>
            )}
          </>
        )}
        {mediaState.error && (
          <p role="alert" className="text-sm text-destructive">
            {mediaState.error}
          </p>
        )}
        {mediaError && (
          <p role="alert" className="text-sm text-destructive">
            Tambahkan minimal 1 foto atau video.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <Label htmlFor="caption">Caption</Label>
        <Textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={5}
          aria-invalid={captionError ? true : undefined}
          aria-describedby="caption-count"
        />
        <p
          id="caption-count"
          className={cn(
            'text-right text-xs',
            captionError ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {caption.length}/{POST_CAPTION_MAX_LENGTH}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {live ? (
          <p className="text-sm">
            <span className="font-medium">Akses: </span>
            {premium ? 'Premium' : 'Gratis'}
          </p>
        ) : (
          <SegmentedControl
            label="Akses"
            value={visibility}
            options={ACCESS_OPTIONS}
            onChange={setVisibility}
          />
        )}
        {premium && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="price">Harga (Koin)</Label>
            <input
              id="price"
              inputMode="numeric"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              aria-invalid={tried && priceError ? true : undefined}
              aria-describedby="price-help"
              className="h-12 rounded-xl border bg-card px-4 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <p
              id="price-help"
              className={cn('text-sm', priceError ? 'text-destructive' : 'text-muted-foreground')}
            >
              {price !== null
                ? `≈ ${formatRupiah(price * 1000)} per unlock · kamu terima ≈ ${formatRupiah((price * 1000 * (100 - PLATFORM_FEE_PERCENT)) / 100)} setelah biaya platform ${PLATFORM_FEE_PERCENT}%`
                : `Masukkan angka bulat ${POST_OFFER_MIN_PRICE_COINS}–${POST_OFFER_MAX_PRICE_COINS.toLocaleString('id-ID')} Koin.`}
            </p>
            {priceChanged && (
              <p className="text-sm text-muted-foreground">
                Harga baru berlaku untuk pembelian berikutnya.
              </p>
            )}
          </div>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card px-4 py-3">
        <div className="mx-auto flex max-w-md gap-2">
          {!live && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => void save(false)}
              className="flex-1"
            >
              Simpan draf
            </Button>
          )}
          <Button type="submit" size="lg" disabled={busy} className="flex-1">
            {saving ? 'Menyimpan…' : live ? 'Simpan' : 'Publikasikan'}
          </Button>
        </div>
      </div>
    </form>
  );
}
