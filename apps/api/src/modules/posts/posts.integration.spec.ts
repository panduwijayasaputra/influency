import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  POST_CAPTION_MAX_LENGTH,
  studioPostListSchema,
  studioPostSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';
const URL = '/api/v1/creators/me/posts';
const UNKNOWN_ID = '0190a000-0000-7000-8000-00000000dead';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-0000001c0001',
  creatorB: '0190a000-0000-7000-8000-0000001c0002',
  pending: '0190a000-0000-7000-8000-0000001c0003',
  plain: '0190a000-0000-7000-8000-0000001c0004',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `posts-spec-${name}`;
const SLUG = { creatorA: 'posts-spec-a', creatorB: 'posts-spec-b', pending: 'posts-spec-p' };

describe('studio posts', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Posts ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    await prisma.creatorProfile.createMany({
      data: [
        { userId: USERS.creatorA, slug: SLUG.creatorA, status: 'APPROVED', ...profileFields('A') },
        { userId: USERS.creatorB, slug: SLUG.creatorB, status: 'APPROVED', ...profileFields('B') },
        { userId: USERS.pending, slug: SLUG.pending, ...profileFields('P') },
      ],
    });

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
  });

  afterAll(async () => {
    await app.close();
    await prisma.post.deleteMany({ where: { creatorProfile: { userId: { in: userIds } } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const cookies = (name?: UserName): Record<string, string> =>
    name ? { influency_session: token(name) } : {};
  const create = (name: UserName | undefined, payload: object, origin = WEB_ORIGIN) =>
    app.inject({ method: 'POST', url: URL, headers: { origin }, cookies: cookies(name), payload });
  const list = (name?: UserName) => app.inject({ method: 'GET', url: URL, cookies: cookies(name) });
  const get = (name: UserName | undefined, id: string) =>
    app.inject({ method: 'GET', url: `${URL}/${id}`, cookies: cookies(name) });
  const patch = (name: UserName | undefined, id: string, payload: object) =>
    app.inject({
      method: 'PATCH',
      url: `${URL}/${id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
      payload,
    });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const withoutRequestId = (res: { json: () => unknown }) => ({ ...errorOf(res), requestId: '' });
  const createPost = async (name: UserName, payload: object) => {
    const res = await create(name, payload);
    expect(res.statusCode).toBe(201);
    return studioPostSchema.parse(res.json());
  };

  it('creates FREE and PREMIUM drafts with exactly the studio fields', async () => {
    const res = await create('creatorA', { caption: '  Halo  ', visibility: 'FREE' });
    expect(res.statusCode).toBe(201);
    const body = res.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual(
      ['caption', 'createdAt', 'id', 'status', 'updatedAt', 'visibility'].sort(),
    );
    expect(body).toMatchObject({ caption: 'Halo', visibility: 'FREE', status: 'DRAFT' });

    const premium = await createPost('creatorA', { visibility: 'PREMIUM' });
    expect(premium).toMatchObject({ caption: '', visibility: 'PREMIUM', status: 'DRAFT' });
  });

  it('ignores a client-supplied status', async () => {
    const post = await createPost('creatorA', { visibility: 'FREE', status: 'PUBLISHED' });
    expect(post.status).toBe('DRAFT');
    const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.status).toBe('DRAFT');
    expect(row.publishedAt).toBeNull();
  });

  it('rejects invalid input', async () => {
    const badVisibility = await create('creatorA', { visibility: 'PUBLIC' });
    expect(badVisibility.statusCode).toBe(400);
    expect(errorOf(badVisibility).code).toBe('VALIDATION_FAILED');
    expect(errorOf(badVisibility).details).toMatchObject({ issues: [{ path: 'visibility' }] });

    const longCaption = await create('creatorA', {
      visibility: 'FREE',
      caption: 'a'.repeat(POST_CAPTION_MAX_LENGTH + 1),
    });
    expect(longCaption.statusCode).toBe(400);
    expect(errorOf(longCaption).details).toMatchObject({ issues: [{ path: 'caption' }] });
  });

  it('enforces the caption limit in the database too', async () => {
    const profile = await prisma.creatorProfile.findUniqueOrThrow({
      where: { userId: USERS.creatorA },
    });
    await expect(
      prisma.post.create({
        data: {
          creatorProfileId: profile.id,
          visibility: 'FREE',
          caption: 'a'.repeat(POST_CAPTION_MAX_LENGTH + 1),
        },
      }),
    ).rejects.toThrow();
  });

  it("lists only the caller's posts, newest first", async () => {
    const first = await createPost('creatorB', { caption: 'B satu', visibility: 'FREE' });
    const second = await createPost('creatorB', { caption: 'B dua', visibility: 'PREMIUM' });

    const res = await list('creatorB');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { posts } = studioPostListSchema.parse(res.json());
    expect(posts.map((p) => p.id)).toEqual([second.id, first.id]);

    const listA = studioPostListSchema.parse((await list('creatorA')).json()).posts;
    expect(listA.length).toBeGreaterThan(0);
    expect(listA.some((p) => p.id === first.id || p.id === second.id)).toBe(false);
  });

  it('reads and edits an own post', async () => {
    const post = await createPost('creatorA', { caption: 'Awal', visibility: 'FREE' });

    const read = await get('creatorA', post.id);
    expect(read.statusCode).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(studioPostSchema.parse(read.json())).toEqual(post);

    const res = await patch('creatorA', post.id, { caption: ' Baru ', visibility: 'PREMIUM' });
    expect(res.statusCode).toBe(200);
    const updated = studioPostSchema.parse(res.json());
    expect(updated).toMatchObject({ id: post.id, caption: 'Baru', visibility: 'PREMIUM' });
    expect(updated.status).toBe('DRAFT');
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(post.updatedAt));

    const cleared = await patch('creatorA', post.id, { caption: '' });
    expect(studioPostSchema.parse(cleared.json()).caption).toBe('');

    const empty = await patch('creatorA', post.id, {});
    expect(empty.statusCode).toBe(400);
    expect(errorOf(empty).code).toBe('VALIDATION_FAILED');
  });

  it("returns not found for another creator's post, like an unknown id", async () => {
    const post = await createPost('creatorA', { caption: 'Milik A', visibility: 'PREMIUM' });
    const unknownGet = await get('creatorB', UNKNOWN_ID);
    const unknownPatch = await patch('creatorB', UNKNOWN_ID, { caption: 'x' });
    expect(unknownGet.statusCode).toBe(404);

    const foreignGet = await get('creatorB', post.id);
    const foreignPatch = await patch('creatorB', post.id, { caption: 'Diubah B' });
    for (const [foreign, unknown] of [
      [foreignGet, unknownGet],
      [foreignPatch, unknownPatch],
    ] as const) {
      expect(foreign.statusCode).toBe(404);
      expect(errorOf(foreign).code).toBe('NOT_FOUND');
      expect(withoutRequestId(foreign)).toEqual(withoutRequestId(unknown));
    }

    const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.caption).toBe('Milik A');
  });

  it('rejects a malformed post id', async () => {
    for (const res of [await get('creatorA', 'not-a-uuid'), await patch('creatorA', 'x', {})]) {
      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_FAILED');
    }
  });

  it('requires a session and an approved creator profile', async () => {
    for (const res of [
      await create(undefined, { visibility: 'FREE' }),
      await list(),
      await get(undefined, UNKNOWN_ID),
      await patch(undefined, UNKNOWN_ID, { caption: 'x' }),
    ]) {
      expect(res.statusCode).toBe(401);
      expect(errorOf(res).code).toBe('AUTH_REQUIRED');
    }
    for (const name of ['plain', 'pending'] as const) {
      for (const res of [
        await create(name, { visibility: 'FREE' }),
        await list(name),
        await get(name, UNKNOWN_ID),
        await patch(name, UNKNOWN_ID, { caption: 'x' }),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(errorOf(res).code).toBe('CREATOR_NOT_APPROVED');
      }
    }
  });

  it('rejects cross-site writes', async () => {
    const res = await create('creatorA', { visibility: 'FREE' }, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('leaves the existing /creators routes reachable', async () => {
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/creators/me',
      cookies: cookies('creatorA'),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ slug: SLUG.creatorA });

    const publicProfile = await app.inject({
      method: 'GET',
      url: `/api/v1/creators/${SLUG.creatorA}`,
    });
    expect(publicProfile.statusCode).toBe(200);
  });
});
