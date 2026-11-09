import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { publicPostListSchema, type PostStatus, type PostVisibility } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000240101',
  suspended: '0190a000-0000-7000-8000-000000240102',
  pending: '0190a000-0000-7000-8000-000000240103',
} as const;
type UserName = keyof typeof USERS;
const SLUG = 'preview-spec-creator';
const WEBP = new Uint8Array([...Buffer.from('RIFF'), 0x24, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]);

describe('public cover previews', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  const profiles = {} as Record<UserName, string>;
  const secrets: string[] = [];
  let app: NestFastifyApplication;

  /** A post with a media cover (or a dedicated one) whose preview is in storage. */
  const post = async (
    owner: UserName,
    visibility: PostVisibility,
    status: PostStatus,
    cover: 'media' | 'upload' | 'none' = 'media',
  ) => {
    const row = await prisma.post.create({
      data: { creatorProfileId: profiles[owner], visibility, status, publishedAt: new Date() },
    });
    if (cover === 'none') return { id: row.id, previewId: null };
    const objectKey = `post-media/${randomUUID()}`;
    const media = await prisma.mediaAsset.create({
      data: {
        postId: row.id,
        kind: 'IMAGE',
        status: 'READY',
        objectKey,
        contentType: 'image/png',
        byteSize: 10,
        uploadExpiresAt: new Date(),
      },
    });
    secrets.push(media.id, objectKey);
    const previewId = randomUUID();
    memory.objects.set(`post-previews/${previewId}`, { body: WEBP, contentType: 'image/webp' });
    await prisma.post.update({
      where: { id: row.id },
      data: {
        previewKey: `post-previews/${previewId}`,
        coverMediaId: cover === 'media' ? media.id : null,
      },
    });
    return { id: row.id, previewId };
  };

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Preview ${name}`,
        status: name === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
      })),
    });
    for (const name of Object.keys(USERS) as UserName[]) {
      const profile = await prisma.creatorProfile.create({
        data: {
          userId: USERS[name],
          slug: name === 'creator' ? SLUG : `preview-spec-${name}`,
          status: name === 'pending' ? 'PENDING_REVIEW' : 'APPROVED',
          ...profileFields(name),
        },
      });
      profiles[name] = profile.id;
    }
    const telegram = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(telegram.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(memory.storage)
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
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.post.updateMany({ where, data: { coverMediaId: null, previewKey: null } });
    await prisma.mediaAsset.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const feed = async () => app.inject({ method: 'GET', url: `/api/v1/creators/${SLUG}/posts` });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const previewPath = (postId: string, previewId: string, slug = SLUG) =>
    `/api/v1/creators/${slug}/posts/${postId}/preview/${previewId}`;

  it('lists previewUrl for premium posts and serves the preview as an immutable WebP', async () => {
    const premium = await post('creator', 'PREMIUM', 'PUBLISHED');
    const res = await feed();
    const item = publicPostListSchema.parse(res.json()).posts.find((p) => p.id === premium.id)!;
    expect(item.previewUrl).toBe(previewPath(premium.id, premium.previewId!));
    const image = await get(item.previewUrl!);
    expect(image.statusCode).toBe(200);
    expect(image.headers).toMatchObject({
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    expect(image.rawPayload.equals(Buffer.from(WEBP))).toBe(true);
  });

  it('never exposes the source media id or object key', async () => {
    await post('creator', 'PREMIUM', 'PUBLISHED', 'media');
    const body = (await feed()).body;
    for (const secret of secrets) expect(body).not.toContain(secret);
    expect(body).not.toMatch(/post-media\/|post-previews\/|post-video\//);
  });

  it('is null without a cover (generic locked placeholder) and for FREE posts with a leftover cover', async () => {
    const bare = await post('creator', 'PREMIUM', 'PUBLISHED', 'none');
    const leftover = await post('creator', 'FREE', 'PUBLISHED', 'upload');
    const { posts } = publicPostListSchema.parse((await feed()).json());
    expect(posts.find((p) => p.id === bare.id)!.previewUrl).toBeNull();
    expect(posts.find((p) => p.id === leftover.id)!.previewUrl).toBeNull();
    expect((await get(previewPath(leftover.id, leftover.previewId!))).statusCode).toBe(404);
  });

  it('serves only the current preview', async () => {
    const premium = await post('creator', 'PREMIUM', 'PUBLISHED');
    const newId = randomUUID();
    memory.objects.set(`post-previews/${newId}`, { body: WEBP, contentType: 'image/webp' });
    await prisma.post.update({
      where: { id: premium.id },
      data: { previewKey: `post-previews/${newId}` },
    });
    expect((await get(previewPath(premium.id, premium.previewId!))).statusCode).toBe(404);
    expect((await get(previewPath(premium.id, newId))).statusCode).toBe(200);
  });

  it.each(['DRAFT', 'ARCHIVED', 'PENDING_REVIEW', 'REMOVED'] as const)(
    'is 404 for a %s post',
    async (status) => {
      const p = await post('creator', 'PREMIUM', status);
      expect((await get(previewPath(p.id, p.previewId!))).statusCode).toBe(404);
    },
  );

  it.each(['suspended', 'pending'] as const)('is 404 for a %s creator', async (owner) => {
    const p = await post(owner, 'PREMIUM', 'PUBLISHED');
    expect((await get(previewPath(p.id, p.previewId!, `preview-spec-${owner}`))).statusCode).toBe(
      404,
    );
  });

  it('is 404 for a wrong slug or malformed ids', async () => {
    const p = await post('creator', 'PREMIUM', 'PUBLISHED');
    expect((await get(previewPath(p.id, p.previewId!, 'preview-spec-pending'))).statusCode).toBe(
      404,
    );
    expect((await get(previewPath('nope', p.previewId!))).statusCode).toBe(404);
    expect((await get(previewPath(p.id, '../post-media/x'))).statusCode).toBe(404);
    expect((await get(previewPath(p.id, 'nope'))).statusCode).toBe(404);
  });

  it('matches the slug case-insensitively', async () => {
    const p = await post('creator', 'PREMIUM', 'PUBLISHED');
    expect((await get(previewPath(p.id, p.previewId!, SLUG.toUpperCase()))).statusCode).toBe(200);
  });
});
