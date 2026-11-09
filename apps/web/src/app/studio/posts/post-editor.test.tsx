import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST_MEDIA_MAX_PER_POST, type StudioMedia, type StudioPost } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { PostEditor } from './post-editor';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const API = `/api/v1/creators/me/posts`;

const post = (over: Partial<StudioPost> = {}): StudioPost => ({
  id: POST_ID,
  caption: 'Halo',
  visibility: 'FREE',
  status: 'DRAFT',
  offer: null,
  cover: null,
  publishedAt: null,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...over,
});
const media = (n: number, over: Partial<StudioMedia> = {}): StudioMedia => ({
  id: `0190a000-0000-7000-8000-00000000010${n}`,
  kind: 'IMAGE',
  status: 'READY',
  contentType: 'image/png',
  byteSize: 10,
  durationSeconds: null,
  rejectionReason: null,
  createdAt: '2026-11-03T00:00:00.000Z',
  ...over,
});
const apiError = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message, requestId: 'req_1', details: null } }, { status });

type Handler = (url: string, init?: RequestInit) => Response | undefined;

/** Answers by `METHOD url`; anything unmatched is a test failure (500). Returns the calls as "METHOD url". */
function stubFetch(...handlers: Handler[]) {
  const calls: string[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    for (const handler of handlers) {
      const res = handler(url, init);
      if (res) return Promise.resolve(res);
    }
    return Promise.resolve(new Response('unexpected call', { status: 500 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
const on =
  (method: string, url: string, res: () => Response): Handler =>
  (u, init) =>
    (init?.method ?? 'GET') === method && u === url ? res() : undefined;

const renderEditor = (props: Parameters<typeof PostEditor>[0]) =>
  render(<PostEditor {...props} />, { wrapper: Toaster });
const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText('Tambah foto atau video'), { target: { files: [file] } });
const png = () => new File([new Uint8Array(10)], 'a.png', { type: 'image/png' });

describe('PostEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('new post', () => {
    it('offers Publikasikan and Simpan draf, and creates nothing on open', () => {
      const { calls } = stubFetch();
      renderEditor({ creatorSlug: 'nadia' });
      expect(screen.getByRole('button', { name: 'Publikasikan' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Simpan draf' })).toBeVisible();
      expect(calls).toEqual([]);
    });

    it('refuses to publish without media and calls nothing', () => {
      const { calls } = stubFetch();
      renderEditor({ creatorSlug: 'nadia' });
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      expect(screen.getByText('Tambahkan minimal 1 foto atau video.')).toBeVisible();
      expect(calls).toEqual([]);
    });

    it('creates the draft on the first media add only, then reuses it', async () => {
      const slot = (n: number) =>
        Response.json(
          {
            media: media(n, { status: 'PENDING_UPLOAD' }),
            upload: {
              url: `https://storage.test/up${n}`,
              method: 'PUT',
              headers: {},
              expiresAt: '2026-11-03T00:05:00.000Z',
            },
          },
          { status: 201 },
        );
      let slots = 0;
      const { calls } = stubFetch(
        on('POST', API, () => Response.json(post(), { status: 201 })),
        on('POST', `${API}/${POST_ID}/media`, () => slot(++slots)),
        (url, init) => (init?.method === 'PUT' ? new Response(null, { status: 200 }) : undefined),
        (url, init) =>
          init?.method === 'POST' && url.endsWith('/complete')
            ? Response.json(media(url.includes('0101') ? 1 : 2))
            : undefined,
      );
      renderEditor({ creatorSlug: 'nadia' });
      choose(png());
      await waitFor(() => expect(screen.getByText(`1 / ${POST_MEDIA_MAX_PER_POST}`)).toBeVisible());
      choose(png());
      await waitFor(() => expect(screen.getByText(`2 / ${POST_MEDIA_MAX_PER_POST}`)).toBeVisible());
      expect(calls.filter((c) => c === `POST ${API}`)).toHaveLength(1);
      expect(calls.filter((c) => c === `POST ${API}/${POST_ID}/media`)).toHaveLength(2);
    });

    it('disables adding at the limit and says why', () => {
      const many = Array.from({ length: POST_MEDIA_MAX_PER_POST }, (_, i) => media(i % 10));
      stubFetch();
      renderEditor({ post: post(), media: many, creatorSlug: 'nadia' });
      expect(screen.getByLabelText('Tambah foto atau video')).toBeDisabled();
      expect(
        screen.getByText(`Maksimal ${POST_MEDIA_MAX_PER_POST} foto atau video per post.`),
      ).toBeVisible();
    });
  });

  describe('caption and price', () => {
    it('counts the caption', () => {
      stubFetch();
      renderEditor({ creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'abc' } });
      expect(screen.getByText(/^3\//)).toBeVisible();
    });

    it('shows the price helper for Premium and hides the field for Gratis', () => {
      stubFetch();
      renderEditor({ creatorSlug: 'nadia' });
      expect(screen.queryByLabelText('Harga (Koin)')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Premium' }));
      expect(
        screen.getByText(
          '≈ Rp25.000 per unlock · kamu terima ≈ Rp20.000 setelah biaya platform 20%',
        ),
      ).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Gratis' }));
      expect(screen.queryByLabelText('Harga (Koin)')).toBeNull();
    });

    it.each(['4', '1001', '2.5', 'abc', ''])('rejects the price %j', (value) => {
      stubFetch();
      renderEditor({ creatorSlug: 'nadia' });
      fireEvent.click(screen.getByRole('button', { name: 'Premium' }));
      fireEvent.change(screen.getByLabelText('Harga (Koin)'), { target: { value } });
      expect(screen.getByText('Masukkan angka bulat 5–1.000 Koin.')).toBeVisible();
    });

    it('does not save an invalid price', () => {
      const { calls } = stubFetch();
      renderEditor({
        post: post({ visibility: 'PREMIUM' }),
        media: [media(1)],
        creatorSlug: 'nadia',
      });
      fireEvent.change(screen.getByLabelText('Harga (Koin)'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      expect(calls).toEqual([]);
    });
  });

  describe('saving', () => {
    const premiumDraft = () =>
      post({ visibility: 'PREMIUM', caption: 'Lama', offer: null, cover: null });

    it('runs caption → offer → cover → publish in order, then opens the profile', async () => {
      const { calls } = stubFetch(
        on('PATCH', `${API}/${POST_ID}`, () => Response.json(post({ caption: 'Baru' }))),
        on('PUT', `${API}/${POST_ID}/offer`, () => Response.json(premiumDraft())),
        on('PUT', `${API}/${POST_ID}/cover`, () => Response.json(premiumDraft())),
        on('POST', `${API}/${POST_ID}/publish`, () =>
          Response.json({ ...premiumDraft(), status: 'PUBLISHED' }),
        ),
      );
      renderEditor({ post: premiumDraft(), media: [media(1)], creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Baru' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/nadia'));
      expect(calls).toEqual([
        `PATCH ${API}/${POST_ID}`,
        `PUT ${API}/${POST_ID}/offer`,
        `PUT ${API}/${POST_ID}/cover`,
        `POST ${API}/${POST_ID}/publish`,
      ]);
      expect(await screen.findByText('Post dipublikasikan')).toBeVisible();
    });

    it('sends the price as a whole number of Koin', async () => {
      const { fetchMock } = stubFetch(
        on('PUT', `${API}/${POST_ID}/offer`, () => Response.json(premiumDraft())),
        on('PUT', `${API}/${POST_ID}/cover`, () => Response.json(premiumDraft())),
        on('POST', `${API}/${POST_ID}/publish`, () => Response.json(premiumDraft())),
      );
      renderEditor({
        post: { ...premiumDraft(), caption: 'Lama' },
        media: [media(1)],
        creatorSlug: 'nadia',
      });
      fireEvent.change(screen.getByLabelText('Harga (Koin)'), { target: { value: '40' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      await waitFor(() => expect(router.push).toHaveBeenCalled());
      const offer = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/offer'));
      expect(JSON.parse(offer?.[1]?.body as string)).toEqual({ priceCoins: 40 });
    });

    it('stops at the first failing step, keeps the form and does not publish', async () => {
      const { calls } = stubFetch(
        on('PATCH', `${API}/${POST_ID}`, () => Response.json(post({ caption: 'Tetap' }))),
        on('PUT', `${API}/${POST_ID}/offer`, () => Response.json(premiumDraft())),
        on('PUT', `${API}/${POST_ID}/cover`, () =>
          apiError(409, 'COVER_SOURCE_UNAVAILABLE', 'Sumber sampul belum siap.'),
        ),
      );
      renderEditor({ post: premiumDraft(), media: [media(1)], creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Tetap' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Sumber sampul belum siap.');
      expect(calls.some((c) => c.endsWith('/publish'))).toBe(false);
      expect(screen.getByLabelText('Caption')).toHaveValue('Tetap');
      expect(router.push).not.toHaveBeenCalled();
    });

    it('explains a video that is still processing', async () => {
      stubFetch(
        on('PATCH', `${API}/${POST_ID}`, () => Response.json(post())),
        on('POST', `${API}/${POST_ID}/publish`, () =>
          apiError(409, 'MEDIA_PROCESSING', 'Media masih diproses.'),
        ),
      );
      renderEditor({ post: post(), media: [media(1)], creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Video masih diproses. Coba lagi sebentar lagi.',
      );
    });

    it('Simpan draf saves without publishing', async () => {
      const { calls } = stubFetch(on('PATCH', `${API}/${POST_ID}`, () => Response.json(post())));
      renderEditor({ post: post(), media: [media(1)], creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Simpan draf' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/nadia'));
      expect(calls).toEqual([`PATCH ${API}/${POST_ID}`]);
    });
  });

  describe('live post', () => {
    const live = post({
      status: 'PUBLISHED',
      visibility: 'PREMIUM',
      offer: { version: 1, priceCoins: 25, createdAt: '2026-11-03T00:00:00.000Z' },
      cover: { mediaId: media(1).id, previewUrl: '/x' },
    });

    it('locks media and access with a reason and shows Simpan', () => {
      stubFetch();
      renderEditor({ post: live, media: [media(1), media(2)], creatorSlug: 'nadia' });
      expect(
        screen.getByText('Media dan akses tidak bisa diubah setelah dipublikasikan.'),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Gratis' })).toBeNull();
      expect(screen.queryByLabelText('Tambah foto atau video')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Geser kanan' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Simpan' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Publikasikan' })).toBeNull();
    });

    it('notes that a new price applies to later purchases and never publishes', async () => {
      const { calls } = stubFetch(on('PUT', `${API}/${POST_ID}/offer`, () => Response.json(live)));
      renderEditor({ post: live, media: [media(1)], creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Harga (Koin)'), { target: { value: '30' } });
      expect(screen.getByText('Harga baru berlaku untuk pembelian berikutnya.')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/nadia'));
      expect(calls).toEqual([`PUT ${API}/${POST_ID}/offer`]);
      expect(await screen.findByText('Perubahan disimpan')).toBeVisible();
    });
  });

  describe('saving the media order', () => {
    const MEDIA_ORDER_URL = `${API}/${POST_ID}/media/order`;
    const reordered = (...ids: StudioMedia[]) => Response.json({ media: ids });
    const moveSecondFirst = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gambar 2' }));
      fireEvent.click(screen.getByRole('button', { name: 'Geser kiri' }));
    };

    it('sends the new order first, then the offer and the cover of the new first item', async () => {
      const draft = post({ visibility: 'PREMIUM' });
      const { calls, fetchMock } = stubFetch(
        on('PUT', MEDIA_ORDER_URL, () => reordered(media(2), media(1))),
        on('PUT', `${API}/${POST_ID}/offer`, () => Response.json(draft)),
        on('PUT', `${API}/${POST_ID}/cover`, () => Response.json(draft)),
        on('POST', `${API}/${POST_ID}/publish`, () => Response.json(draft)),
      );
      renderEditor({ post: draft, media: [media(1), media(2)], creatorSlug: 'nadia' });
      moveSecondFirst();
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/nadia'));
      expect(calls).toEqual([
        `PUT ${MEDIA_ORDER_URL}`,
        `PUT ${API}/${POST_ID}/offer`,
        `PUT ${API}/${POST_ID}/cover`,
        `POST ${API}/${POST_ID}/publish`,
      ]);
      const order = fetchMock.mock.calls.find(([url]) => String(url) === MEDIA_ORDER_URL);
      expect(JSON.parse(order?.[1]?.body as string)).toEqual({
        mediaIds: [media(2).id, media(1).id],
      });
      const cover = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/cover'));
      expect(JSON.parse(cover?.[1]?.body as string)).toEqual({ mediaId: media(2).id });
    });

    it('does not send an order that did not change', async () => {
      const { calls } = stubFetch(on('PATCH', `${API}/${POST_ID}`, () => Response.json(post())));
      renderEditor({ post: post(), media: [media(1), media(2)], creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Simpan draf' }));
      await waitFor(() => expect(router.push).toHaveBeenCalled());
      expect(calls).toEqual([`PATCH ${API}/${POST_ID}`]);
    });

    it('does not publish when the order could not be saved, and the retry sends it again', async () => {
      const { calls } = stubFetch(
        on('PUT', MEDIA_ORDER_URL, () => apiError(409, 'POST_LOCKED', 'Post sudah terbit.')),
      );
      renderEditor({ post: post(), media: [media(1), media(2)], creatorSlug: 'nadia' });
      moveSecondFirst();
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Post sudah terbit.');
      expect(calls).toEqual([`PUT ${MEDIA_ORDER_URL}`]);
      expect(router.push).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
      await waitFor(() => expect(calls.filter((c) => c.startsWith('PUT')).length).toBe(2));
    });

    it('never sends an order for a live post', async () => {
      const live = post({ status: 'PUBLISHED' });
      const { calls } = stubFetch(on('PATCH', `${API}/${POST_ID}`, () => Response.json(live)));
      renderEditor({ post: live, media: [media(1), media(2)], creatorSlug: 'nadia' });
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
      await waitFor(() => expect(router.push).toHaveBeenCalled());
      expect(calls.some((c) => c.includes('/order'))).toBe(false);
    });
  });

  describe('media order', () => {
    it('moves the selected item and the cover badge follows the first', () => {
      stubFetch();
      renderEditor({ post: post(), media: [media(1), media(2)], creatorSlug: 'nadia' });
      expect(screen.getByText('Sampul')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Geser kiri' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Gambar 2' }));
      expect(screen.queryByText('Sampul')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Geser kiri' }));
      // The moved item is now first and still selected: it carries the badge.
      expect(screen.getByText('Sampul')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Geser kiri' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Geser kanan' })).toBeEnabled();
    });

    it('removes the selected item', async () => {
      stubFetch(
        on(
          'DELETE',
          `${API}/${POST_ID}/media/${media(1).id}`,
          () => new Response(null, { status: 204 }),
        ),
      );
      renderEditor({ post: post(), media: [media(1), media(2)], creatorSlug: 'nadia' });
      fireEvent.click(screen.getByRole('button', { name: 'Hapus media' }));
      await waitFor(() => expect(screen.getByText(`1 / ${POST_MEDIA_MAX_PER_POST}`)).toBeVisible());
    });

    it('shows why an item failed', () => {
      stubFetch();
      renderEditor({
        post: post(),
        media: [media(1, { status: 'REJECTED', rejectionReason: 'TOO_LARGE' })],
        creatorSlug: 'nadia',
      });
      expect(screen.getByText('Ukuran file melebihi batas.')).toBeVisible();
    });
  });
});
