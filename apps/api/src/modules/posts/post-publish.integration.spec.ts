import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  mediaUploadResponseSchema,
  publicPostListSchema,
  studioPostSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';

const WEB_ORIGIN = 'http://localhost:3000';
const URL = '/api/v1/creators/me/posts';
const UNKNOWN_ID = '0190a000-0000-7000-8000-00000000dead';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-000000200001',
  creatorB: '0190a000-0000-7000-8000-000000200002',
  plain: '0190a000-0000-7000-8000-000000200003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-publish-spec-${name}`;

async function buildApp(
  storage: ReturnType<typeof createMemoryStorage>['storage'],
  moderation: boolean,
): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .overrideProvider(ENV)
    .useValue({ ...parseEnv(process.env), POST_MODERATION_REQUIRED: moderation })
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      { logger: false },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('publish / archive / restore posts', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  let app: NestFastifyApplication;
  let moderatedApp: NestFastifyApplication;
  let profileA: string;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Publish ${name}` })),
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
        {
          userId: USERS.creatorA,
          slug: 'publish-spec-a',
          status: 'APPROVED',
          ...profileFields('A'),
        },
        {
          userId: USERS.creatorB,
          slug: 'publish-spec-b',
          status: 'APPROVED',
          ...profileFields('B'),
        },
      ],
    });
    profileA = (
      await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: USERS.creatorA } })
    ).id;
    app = await buildApp(memory.storage, false);
    moderatedApp = await buildApp(memory.storage, true);
  });

  afterAll(async () => {
    await app.close();
    await moderatedApp.close();
    const owned = { post: { creatorProfile: { userId: { in: userIds } } } };
    await prisma.mediaAsset.deleteMany({ where: owned });
    await prisma.postArchiveEpisode.deleteMany({ where: owned });
    await prisma.postOffer.deleteMany({ where: owned });
    await prisma.post.deleteMany({ where: owned.post });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const cookies = (name?: UserName): Record<string, string> =>
    name ? { influency_session: token(name) } : {};
  const action = (
    which: 'publish' | 'archive' | 'restore',
    name: UserName | undefined,
    id: string,
    { origin = WEB_ORIGIN, target = app } = {},
  ) =>
    target.inject({
      method: 'POST',
      url: `${URL}/${id}/${which}`,
      headers: { origin },
      cookies: cookies(name),
    });
  const send = (method: 'PATCH' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies('creatorA'),
      ...(payload ? { payload } : {}),
    });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const createPost = async (
    visibility: 'FREE' | 'PREMIUM',
    { media = ['READY'] as ('READY' | 'PROCESSING' | 'PENDING_UPLOAD' | 'REJECTED')[] } = {},
  ) => {
    const post = await prisma.post.create({ data: { creatorProfileId: profileA, visibility } });
    for (const status of media) {
      const video = status === 'PROCESSING';
      await prisma.mediaAsset.create({
        data: {
          postId: post.id,
          kind: video ? 'VIDEO' : 'IMAGE',
          status,
          ...(video ? { videoUid: randomUUID() } : { objectKey: `post-media/${randomUUID()}` }),
          contentType: video ? 'video/mp4' : 'image/png',
          byteSize: 10,
          uploadExpiresAt: new Date(Date.now() + 300_000),
        },
      });
    }
    return post.id;
  };
  const addOffer = (postId: string) =>
    prisma.postOffer.create({
      data: { postId, version: 1, priceCoins: 5n },
    });

  it('publishes a FREE draft with a READY image', async () => {
    const id = await createPost('FREE');
    const res = await action('publish', 'creatorA', id);
    expect(res.statusCode).toBe(200);
    const body = studioPostSchema.parse(res.json());
    expect(body.status).toBe('PUBLISHED');
    expect(body.publishedAt).not.toBeNull();
  });

  it.each([[[]], [['PENDING_UPLOAD']], [['REJECTED']]] as const)(
    'rejects publishing with media %j as MEDIA_REQUIRED',
    async (media) => {
      const id = await createPost('FREE', { media: [...media] });
      const res = await action('publish', 'creatorA', id);
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('MEDIA_REQUIRED');
    },
  );

  it('rejects publishing while a video is PROCESSING', async () => {
    const id = await createPost('FREE', { media: ['READY', 'PROCESSING'] });
    const res = await action('publish', 'creatorA', id);
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).code).toBe('MEDIA_PROCESSING');
  });

  it('requires an offer for a PREMIUM post', async () => {
    const id = await createPost('PREMIUM');
    const res = await action('publish', 'creatorA', id);
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).code).toBe('OFFER_REQUIRED');
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');

    await addOffer(id);
    const ok = await action('publish', 'creatorA', id);
    expect(ok.statusCode).toBe(200);
    expect(studioPostSchema.parse(ok.json()).status).toBe('PUBLISHED');
  });

  const episodes = (postId: string) =>
    prisma.postArchiveEpisode.findMany({ where: { postId }, orderBy: { archivedAt: 'asc' } });

  it('archives and restores, keeping the first publish time and recording episodes', async () => {
    const id = await createPost('FREE');
    const first = studioPostSchema.parse((await action('publish', 'creatorA', id)).json());

    const again = await action('publish', 'creatorA', id);
    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe('POST_STATUS_CONFLICT');

    const archived = await action('archive', 'creatorA', id);
    expect(archived.statusCode).toBe(200);
    expect(studioPostSchema.parse(archived.json()).status).toBe('ARCHIVED');
    expect(await episodes(id)).toMatchObject([{ restoredAt: null }]);

    for (const which of ['archive', 'publish'] as const) {
      const res = await action(which, 'creatorA', id);
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('POST_STATUS_CONFLICT');
    }
    expect(await episodes(id)).toHaveLength(1);

    const restored = studioPostSchema.parse((await action('restore', 'creatorA', id)).json());
    expect(restored.status).toBe('PUBLISHED');
    expect(restored.publishedAt).toBe(first.publishedAt);
    const [closed] = await episodes(id);
    expect(closed!.restoredAt!.getTime()).toBeGreaterThanOrEqual(closed!.archivedAt.getTime());

    const restoreAgain = await action('restore', 'creatorA', id);
    expect(restoreAgain.statusCode).toBe(409);
    expect(errorOf(restoreAgain).code).toBe('POST_STATUS_CONFLICT');

    // Re-archiving opens a fresh episode and leaves the closed one untouched.
    await action('archive', 'creatorA', id);
    const [kept, open] = await episodes(id);
    expect(kept).toEqual(closed);
    expect(open).toMatchObject({ restoredAt: null });
  });

  it('drops an archived post from the public feed and brings it back on restore', async () => {
    const id = await createPost('FREE');
    await action('publish', 'creatorA', id);
    const feedIds = async () =>
      publicPostListSchema
        .parse((await app.inject({ url: '/api/v1/creators/publish-spec-a/posts' })).json())
        .posts.map((p) => p.id);
    expect(await feedIds()).toContain(id);
    await action('archive', 'creatorA', id);
    expect(await feedIds()).not.toContain(id);
    expect(await prisma.post.count({ where: { id } })).toBe(1);
    await action('restore', 'creatorA', id);
    expect(await feedIds()).toContain(id);
  });
  it('only archives PUBLISHED posts and only restores ARCHIVED ones', async () => {
    const draft = await createPost('FREE');
    const removed = await createPost('FREE');
    await prisma.post.update({ where: { id: removed }, data: { status: 'REMOVED' } });
    const published = await createPost('FREE');
    await action('publish', 'creatorA', published);
    for (const [which, id] of [
      ['archive', draft],
      ['restore', draft],
      ['publish', removed],
      ['archive', removed],
      ['restore', removed],
      ['restore', published],
    ] as const) {
      const res = await action(which, 'creatorA', id);
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('POST_STATUS_CONFLICT');
    }
    expect(
      await prisma.postArchiveEpisode.count({
        where: { postId: { in: [draft, removed, published] } },
      }),
    ).toBe(0);
  });

  it('sends posts to PENDING_REVIEW when moderation is required, which cannot be archived', async () => {
    const id = await createPost('FREE');
    const res = await action('publish', 'creatorA', id, { target: moderatedApp });
    expect(res.statusCode).toBe(200);
    expect(studioPostSchema.parse(res.json())).toMatchObject({ status: 'PENDING_REVIEW' });

    const archived = await action('archive', 'creatorA', id, { target: moderatedApp });
    expect(archived.statusCode).toBe(409);
    expect(errorOf(archived).code).toBe('POST_STATUS_CONFLICT');
  });

  it('opens exactly one episode when two archives race', async () => {
    const id = await createPost('FREE');
    await action('publish', 'creatorA', id);
    const results = await Promise.all([
      action('archive', 'creatorA', id),
      action('archive', 'creatorA', id),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await episodes(id)).toHaveLength(1);
  });

  it('allows at most one open episode per post in the DB', async () => {
    const id = await createPost('FREE');
    await action('publish', 'creatorA', id);
    await action('archive', 'creatorA', id);
    await expect(prisma.postArchiveEpisode.create({ data: { postId: id } })).rejects.toThrow();
  });

  it('only allows caption and price edits while the post is live or archived', async () => {
    const id = await createPost('PREMIUM');
    await addOffer(id);
    const media = await prisma.mediaAsset.findFirstOrThrow({ where: { postId: id } });
    await action('publish', 'creatorA', id);

    for (const state of ['live', 'archived'] as const) {
      if (state === 'archived') await action('archive', 'creatorA', id);
      expect((await send('PATCH', `${URL}/${id}`, { caption: 'Baru' })).statusCode).toBe(200);
      const same = await send('PATCH', `${URL}/${id}`, { caption: 'Lagi', visibility: 'PREMIUM' });
      expect(same.statusCode).toBe(200);
      expect(studioPostSchema.parse(same.json()).caption).toBe('Lagi');
      expect((await send('PUT', `${URL}/${id}/offer`, { priceCoins: 20 })).statusCode).toBe(200);

      const locked = [
        await send('PATCH', `${URL}/${id}`, { visibility: 'FREE' }),
        await send('POST', `${URL}/${id}/media`, { contentType: 'image/png', byteSize: 10 }),
        await send('DELETE', `${URL}/${id}/media/${media.id}`),
      ];
      for (const res of locked) {
        expect(res.statusCode).toBe(409);
        expect(errorOf(res).code).toBe('POST_LOCKED');
      }
      const row = await prisma.post.findUniqueOrThrow({ where: { id } });
      expect(row.visibility).toBe('PREMIUM');
      expect(await prisma.mediaAsset.count({ where: { id: media.id } })).toBe(1);
    }
  });

  it('rejects completing a pending upload after publish, but a READY complete stays idempotent', async () => {
    const id = await createPost('FREE');
    const slot = await send('POST', `${URL}/${id}/media`, {
      contentType: 'image/png',
      byteSize: PNG.length,
    });
    expect(slot.statusCode).toBe(201);
    const { media } = mediaUploadResponseSchema.parse(slot.json());
    const pending = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: media.id } });
    memory.objects.set(pending.objectKey!, { body: new Uint8Array(PNG), contentType: 'image/png' });
    await action('publish', 'creatorA', id);

    const late = await send('POST', `${URL}/${id}/media/${media.id}/complete`);
    expect(late.statusCode).toBe(409);
    expect(errorOf(late).code).toBe('POST_LOCKED');

    const ready = await prisma.mediaAsset.findFirstOrThrow({
      where: { postId: id, status: 'READY' },
    });
    const done = await send('POST', `${URL}/${id}/media/${ready.id}/complete`);
    expect(done.statusCode).toBe(200);
  });

  it('never leaves a published post without media when publish races a delete', async () => {
    const id = await createPost('FREE');
    const media = await prisma.mediaAsset.findFirstOrThrow({ where: { postId: id } });
    const [published, deleted] = await Promise.all([
      action('publish', 'creatorA', id),
      send('DELETE', `${URL}/${id}/media/${media.id}`),
    ]);
    const row = await prisma.post.findUniqueOrThrow({ where: { id } });
    const ready = await prisma.mediaAsset.count({ where: { postId: id, status: 'READY' } });
    if (row.status === 'PUBLISHED') {
      expect(ready).toBe(1);
      expect(errorOf(deleted).code).toBe('POST_LOCKED');
    } else {
      expect(ready).toBe(0);
      expect(errorOf(published).code).toBe('MEDIA_REQUIRED');
    }
  });

  it('scopes publish, archive and restore to the owner', async () => {
    const id = await createPost('FREE');
    for (const which of ['publish', 'archive', 'restore'] as const) {
      expect((await action(which, 'creatorB', id)).statusCode).toBe(404);
      expect((await action(which, 'creatorA', UNKNOWN_ID)).statusCode).toBe(404);
      expect((await action(which, 'creatorA', 'not-a-uuid')).statusCode).toBe(400);
      expect(errorOf(await action(which, 'plain', id)).code).toBe('CREATOR_NOT_APPROVED');
      expect((await action(which, undefined, id)).statusCode).toBe(401);
      expect(
        (await action(which, 'creatorA', id, { origin: 'https://evil.example' })).statusCode,
      ).toBe(403);
    }
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });
});
