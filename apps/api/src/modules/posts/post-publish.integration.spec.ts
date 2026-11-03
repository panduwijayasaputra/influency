import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  mediaUploadResponseSchema,
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

describe('publish / hide posts', () => {
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
    which: 'publish' | 'hide',
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
  const send = (method: 'PATCH' | 'POST' | 'DELETE', url: string, payload?: object) =>
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
      data: { postId, version: 1, priceCoins: 5n, durationSeconds: 604_800 },
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

  it('hides and re-publishes, keeping the first publish time', async () => {
    const id = await createPost('FREE');
    const first = studioPostSchema.parse((await action('publish', 'creatorA', id)).json());

    const again = await action('publish', 'creatorA', id);
    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe('POST_STATUS_CONFLICT');

    const hidden = await action('hide', 'creatorA', id);
    expect(hidden.statusCode).toBe(200);
    expect(studioPostSchema.parse(hidden.json()).status).toBe('HIDDEN');

    const hideAgain = await action('hide', 'creatorA', id);
    expect(hideAgain.statusCode).toBe(409);
    expect(errorOf(hideAgain).code).toBe('POST_STATUS_CONFLICT');

    const republished = studioPostSchema.parse((await action('publish', 'creatorA', id)).json());
    expect(republished.status).toBe('PUBLISHED');
    expect(republished.publishedAt).toBe(first.publishedAt);
  });

  it('rejects hiding a draft', async () => {
    const id = await createPost('FREE');
    const res = await action('hide', 'creatorA', id);
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).code).toBe('POST_STATUS_CONFLICT');
  });

  it('rejects publishing or hiding a REMOVED post', async () => {
    const id = await createPost('FREE');
    await prisma.post.update({ where: { id }, data: { status: 'REMOVED' } });
    for (const which of ['publish', 'hide'] as const) {
      const res = await action(which, 'creatorA', id);
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('POST_STATUS_CONFLICT');
    }
  });

  it('sends posts to PENDING_REVIEW when moderation is required', async () => {
    const id = await createPost('FREE');
    const res = await action('publish', 'creatorA', id, { target: moderatedApp });
    expect(res.statusCode).toBe(200);
    expect(studioPostSchema.parse(res.json())).toMatchObject({ status: 'PENDING_REVIEW' });

    const hidden = await action('hide', 'creatorA', id, { target: moderatedApp });
    expect(studioPostSchema.parse(hidden.json()).status).toBe('HIDDEN');
  });

  it('only allows caption edits while the post is live', async () => {
    const id = await createPost('FREE');
    const media = await prisma.mediaAsset.findFirstOrThrow({ where: { postId: id } });
    await action('publish', 'creatorA', id);

    expect((await send('PATCH', `${URL}/${id}`, { caption: 'Baru' })).statusCode).toBe(200);
    const same = await send('PATCH', `${URL}/${id}`, { caption: 'Lagi', visibility: 'FREE' });
    expect(same.statusCode).toBe(200);
    expect(studioPostSchema.parse(same.json()).caption).toBe('Lagi');

    const locked = [
      await send('PATCH', `${URL}/${id}`, { visibility: 'PREMIUM' }),
      await send('POST', `${URL}/${id}/media`, { contentType: 'image/png', byteSize: 10 }),
      await send('DELETE', `${URL}/${id}/media/${media.id}`),
    ];
    for (const res of locked) {
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('POST_LOCKED');
    }
    const row = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(row.visibility).toBe('FREE');
    expect(await prisma.mediaAsset.count({ where: { id: media.id } })).toBe(1);

    await action('hide', 'creatorA', id);
    expect((await send('PATCH', `${URL}/${id}`, { visibility: 'PREMIUM' })).statusCode).toBe(200);
    expect((await send('DELETE', `${URL}/${id}/media/${media.id}`)).statusCode).toBe(204);
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

  it('scopes publish and hide to the owner', async () => {
    const id = await createPost('FREE');
    for (const which of ['publish', 'hide'] as const) {
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
