import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  LIBRARY_PAGE_SIZE,
  type LibraryPage,
  libraryPageSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import type { PostStatus, PostVisibility } from '../../generated/prisma/client.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const RUN = randomUUID().slice(0, 8);
const MINUTE = 60_000;
const T0 = Date.now() - 600 * MINUTE;
const at = (minutes: number) => new Date(T0 + minutes * MINUTE);

// Purchases are append-only and posts are referenced, so nothing is deleted: fresh rows per run, kept out of the
// ranked public lists with an old createdAt / publishedAt.
describe('GET /me/library', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;

  const users: Record<string, { id: string; token: string }> = {};
  const creators: Record<string, string> = {};
  const posts: Record<string, string> = {};

  async function newUser(name: string) {
    const user = await prisma.user.create({ data: { displayName: `Lib ${name}` } });
    const token = `lib-spec-${RUN}-${name}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    users[name] = { id: user.id, token };
    return user.id;
  }
  async function newCreator(
    key: string,
    over: { status?: 'APPROVED' | 'PENDING_REVIEW'; userStatus?: 'ACTIVE' | 'SUSPENDED' } = {},
  ) {
    const user = await prisma.user.create({
      data: { displayName: `Lib creator ${key}`, status: over.userStatus ?? 'ACTIVE' },
    });
    creators[key] = (
      await prisma.creatorProfile.create({
        data: {
          userId: user.id,
          slug: `lib-${key}-${RUN}`,
          status: over.status ?? 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields(`Lib ${key}`),
        },
      })
    ).id;
  }
  async function newPost(
    key: string,
    creator: string,
    over: {
      visibility?: PostVisibility;
      status?: PostStatus;
      media?: 'IMAGE' | 'VIDEO' | null;
    } = {},
  ) {
    const visibility = over.visibility ?? 'FREE';
    const post = await prisma.post.create({
      data: {
        creatorProfileId: creators[creator]!,
        visibility,
        status: over.status ?? 'PUBLISHED',
        caption: key,
        publishedAt: LEFTOVER_CREATED_AT,
      },
    });
    posts[key] = post.id;
    if (visibility === 'PREMIUM') {
      await prisma.postOffer.create({ data: { postId: post.id, version: 1, priceCoins: 10n } });
    }
    const media = over.media === undefined ? 'IMAGE' : over.media;
    if (media) {
      await prisma.mediaAsset.create({
        data: {
          postId: post.id,
          kind: media,
          status: 'READY',
          ...(media === 'IMAGE'
            ? { objectKey: `post-media/lib-${RUN}-${key}` }
            : { videoUid: `lib-${RUN}-${key}`, durationSeconds: 30 }),
          contentType: media === 'IMAGE' ? 'image/jpeg' : 'video/mp4',
          byteSize: 100,
          uploadExpiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    return post.id;
  }
  const save = (user: string, post: string, minutes: number) =>
    prisma.postSave.create({
      data: { userId: users[user]!.id, postId: posts[post]!, createdAt: at(minutes) },
    });
  async function buy(user: string, post: string, minutes: number) {
    const offer = await prisma.postOffer.findFirstOrThrow({ where: { postId: posts[post]! } });
    return prisma.postPurchase.create({
      data: {
        userId: users[user]!.id,
        postId: posts[post]!,
        postOfferId: offer.id,
        priceCoins: 10n,
        feeBps: 2000,
        createdAt: at(minutes),
      },
    });
  }

  beforeAll(async () => {
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    for (const name of ['me', 'other', 'pager']) await newUser(name);
    await newCreator('a');
    await newCreator('b');
    await newCreator('pending', { status: 'PENDING_REVIEW' });
    await newCreator('suspended', { userStatus: 'SUSPENDED' });

    // me: saved + bought, in a known order (minutes after T0)
    await newPost('freeA', 'a'); //                              saved @1
    await newPost('premLocked', 'a', { visibility: 'PREMIUM' }); // saved @2 only -> locked
    await newPost('premBoth', 'a', { visibility: 'PREMIUM' }); //   saved @3, bought @9 -> one row, addedAt @9
    await newPost('premArchived', 'a', { visibility: 'PREMIUM', status: 'ARCHIVED' }); // bought @4 -> still listed, full
    await newPost('freeB', 'b'); //                               saved @5
    await newPost('videoA', 'a', { media: 'VIDEO' }); //          saved @6
    // Excluded from me's collection
    await newPost('savedArchived', 'a', { status: 'ARCHIVED' }); // saved-only + archived
    await newPost('savedDraft', 'a', { status: 'DRAFT' });
    await newPost('boughtRemoved', 'a', { visibility: 'PREMIUM', status: 'REMOVED' });
    await newPost('ofPending', 'pending');
    await newPost('ofSuspended', 'suspended');
    // other user's items
    await newPost('othersOnly', 'a');

    await save('me', 'freeA', 1);
    await save('me', 'premLocked', 2);
    await save('me', 'premBoth', 3);
    await buy('me', 'premArchived', 4);
    await save('me', 'freeB', 5);
    await save('me', 'videoA', 6);
    await buy('me', 'premBoth', 9);
    for (const key of ['savedArchived', 'savedDraft', 'ofPending', 'ofSuspended']) {
      await save('me', key, 7);
    }
    await buy('me', 'boughtRemoved', 8);
    await save('other', 'othersOnly', 10);

    // pager: LIBRARY_PAGE_SIZE + 4 saved free posts, @100..
    for (let i = 0; i < LIBRARY_PAGE_SIZE + 4; i++) {
      await newPost(`pg${i}`, 'a');
      await save('pager', `pg${i}`, 100 + i);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const get = (user: string | null, query = '') =>
    app.inject({
      method: 'GET',
      url: `/api/v1/me/library${query}`,
      cookies: user ? { [SESSION_COOKIE]: users[user]!.token } : {},
    });
  const page = async (user: string, query = ''): Promise<LibraryPage> => {
    const res = await get(user, query);
    expect(res.statusCode).toBe(200);
    return libraryPageSchema.parse(res.json());
  };
  const captions = (p: LibraryPage) => p.items.map((i) => i.caption);

  it('requires a session and is never cached', async () => {
    const anonymous = await get(null);
    expect(anonymous.statusCode).toBe(401);
    const ok = await get('me');
    expect(ok.headers['cache-control']).toBe('no-store');
  });

  it("lists exactly the caller's saved and bought posts, newest addition first", async () => {
    const p = await page('me');
    // addedAt: premBoth @9 (later of save @3 / buy @9), videoA @6, freeB @5, premArchived @4, premLocked @2, freeA @1
    expect(captions(p)).toEqual([
      'premBoth',
      'videoA',
      'freeB',
      'premArchived',
      'premLocked',
      'freeA',
    ]);
    expect(p.nextCursor).toBeNull();
  });

  it("never returns another user's items", async () => {
    const mine = captions(await page('me'));
    const theirs = captions(await page('other'));
    expect(theirs).toEqual(['othersOnly']);
    expect(mine).not.toContain('othersOnly');
  });

  it('shows a post saved and bought once, with both flags and the later time', async () => {
    const p = await page('me');
    const both = p.items.filter((i) => i.caption === 'premBoth');
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ saved: true, purchased: true, access: 'full' });
    // Compare differences: a JS Date written through the driver adapter can be stored shifted by the local UTC offset
    // (see dbNow), the same for every row, while the real createdAt values come from the database clock.
    const ms = (caption: string) =>
      new Date(p.items.find((i) => i.caption === caption)!.addedAt).getTime();
    expect(ms('premBoth') - ms('premLocked')).toBe(at(9).getTime() - at(2).getTime());
  });

  it('returns a saved-only premium post locked, with only its preview and no media references', async () => {
    const p = await page('me');
    const locked = p.items.find((i) => i.caption === 'premLocked')!;
    expect(locked).toMatchObject({ saved: true, purchased: false, access: 'locked' });
    const json = JSON.stringify(locked);
    expect(json).not.toMatch(/objectKey|videoUid|post-media|signed|token/i);
    // access still goes through the media endpoint, which refuses it
    const media = await app.inject({
      method: 'GET',
      url: `/api/v1/posts/${posts.premLocked!}/media-access`,
      cookies: { [SESSION_COOKIE]: users.me!.token },
    });
    expect(media.statusCode).toBe(403);
  });

  it('keeps a bought post after it is archived, and leaves out removed, draft, archived-saved and non-public creators', async () => {
    const p = await page('me');
    expect(p.items.find((i) => i.caption === 'premArchived')).toMatchObject({
      purchased: true,
      saved: false,
      access: 'full',
    });
    for (const gone of [
      'boughtRemoved',
      'savedArchived',
      'savedDraft',
      'ofPending',
      'ofSuspended',
    ]) {
      expect(captions(p)).not.toContain(gone);
    }
  });

  it('filters by relation: Disimpan includes the saved-and-bought post, Dibeli too', async () => {
    expect(captions(await page('me', '?relation=saved'))).toEqual([
      'premBoth',
      'videoA',
      'freeB',
      'premLocked',
      'freeA',
    ]);
    expect(captions(await page('me', '?relation=purchased'))).toEqual(['premBoth', 'premArchived']);
  });

  it('filters by creator (case-insensitive) and by media kind', async () => {
    const slugB = `LIB-B-${RUN}`.toUpperCase();
    expect(captions(await page('me', `?creator=${slugB}`))).toEqual(['freeB']);
    expect(captions(await page('me', '?media=video'))).toEqual(['videoA']);
    const images = captions(await page('me', '?media=image'));
    expect(images).toEqual(['premBoth', 'freeB', 'premArchived', 'premLocked', 'freeA']);
  });

  it('sorts oldest first', async () => {
    expect(captions(await page('me', '?sort=oldest'))).toEqual([
      'freeA',
      'premLocked',
      'premArchived',
      'freeB',
      'videoA',
      'premBoth',
    ]);
  });

  it('lists the creators of the whole collection on the first page, whatever the filters', async () => {
    const p = await page('me', '?relation=purchased');
    expect(p.creators.map((c) => c.slug)).toEqual([`lib-a-${RUN}`, `lib-b-${RUN}`]);
    expect(p.creators.map((c) => c.displayName)).toEqual(['Lib a', 'Lib b']);
  });

  it.each([
    '?relation=liked',
    '?media=audio',
    '?sort=random',
    '?cursor=garbage',
    '?cursor=1_not-a-uuid',
  ])('rejects invalid query %s with 400', async (query) => {
    const res = await get('me', query);
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
  });

  describe('paging', () => {
    it('returns disjoint, complete pages in order, creators only on the first', async () => {
      const first = await page('pager');
      expect(first.items).toHaveLength(LIBRARY_PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();
      expect(first.creators).toHaveLength(1);
      const second = await page('pager', `?cursor=${first.nextCursor}`);
      expect(second.items).toHaveLength(4);
      expect(second.nextCursor).toBeNull();
      expect(second.creators).toEqual([]);
      const all = [...captions(first), ...captions(second)];
      expect(new Set(all).size).toBe(LIBRARY_PAGE_SIZE + 4);
      expect(all[0]).toBe(`pg${LIBRARY_PAGE_SIZE + 3}`); // newest save first
      expect(all.at(-1)).toBe('pg0');
    });

    it('does not repeat or skip when something is added between pages', async () => {
      const first = await page('pager');
      await newPost('pgNew', 'a');
      await save('pager', 'pgNew', 500);
      const second = await page('pager', `?cursor=${first.nextCursor}`);
      expect(second.items).toHaveLength(4);
      const seen = new Set([...captions(first), ...captions(second)]);
      expect(seen.size).toBe(LIBRARY_PAGE_SIZE + 4);
      expect(seen.has('pgNew')).toBe(false); // newer than page 1: shows on a fresh load, not mid-paging
      expect(captions(await page('pager'))[0]).toBe('pgNew');
    });

    it('pages oldest first too', async () => {
      const first = await page('pager', '?sort=oldest');
      const second = await page('pager', `?sort=oldest&cursor=${first.nextCursor}`);
      const all = [...captions(first), ...captions(second)];
      expect(all.slice(0, 2)).toEqual(['pg0', 'pg1']);
      expect(new Set(all).size).toBe(all.length);
    });
  });
});
