import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  creatorProfileResponseSchema,
  errorResponseSchema,
  PROFILE_IMAGE_MAX_BYTES,
} from '@influency/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-0000001a0001',
  creatorB: '0190a000-0000-7000-8000-0000001a0002',
  pending: '0190a000-0000-7000-8000-0000001a0003',
  plain: '0190a000-0000-7000-8000-0000001a0004',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `creator-profile-spec-${name}`;
const SLUG = { creatorA: 'profile-spec-a', creatorB: 'profile-spec-b', pending: 'profile-spec-p' };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const GIF = Buffer.from('GIF89a....');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const pngOfSize = (size: number) => Buffer.concat([PNG, Buffer.alloc(size - PNG.length)]);

describe('creator profile editing', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Profile ${name}` })),
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

  beforeEach(() => {
    memory.failNext.put = memory.failNext.get = memory.failNext.delete = false;
  });

  afterAll(async () => {
    await app.close();
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const cookies = (name?: UserName): Record<string, string> =>
    name ? { influency_session: token(name) } : {};
  const getMine = (name?: UserName) =>
    app.inject({ method: 'GET', url: '/api/v1/creators/me', cookies: cookies(name) });
  const patch = (name: UserName | undefined, payload: object, origin = WEB_ORIGIN) =>
    app.inject({
      method: 'PATCH',
      url: '/api/v1/creators/me',
      headers: { origin },
      cookies: cookies(name),
      payload,
    });
  const upload = (
    name: UserName | undefined,
    kind: string,
    body: Buffer | string,
    contentType = 'image/png',
    origin = WEB_ORIGIN,
  ) =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/creators/me/${kind}`,
      headers: { origin, 'content-type': contentType },
      cookies: cookies(name),
      payload: body,
    });
  const publicGet = (url: string) => app.inject({ method: 'GET', url });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const row = (name: UserName) =>
    prisma.creatorProfile.findUniqueOrThrow({ where: { userId: USERS[name] } });

  it('requires a session', async () => {
    for (const res of [
      await getMine(),
      await patch(undefined, { bio: 'x' }),
      await upload(undefined, 'avatar', PNG),
    ]) {
      expect(res.statusCode).toBe(401);
      expect(errorOf(res).code).toBe('AUTH_REQUIRED');
    }
  });

  it('rejects users without an approved creator profile', async () => {
    for (const name of ['plain', 'pending'] as const) {
      for (const res of [
        await getMine(name),
        await patch(name, { bio: 'x' }),
        await upload(name, 'avatar', PNG),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(errorOf(res).code).toBe('CREATOR_NOT_APPROVED');
      }
    }
    expect((await row('pending')).bio).toBeNull();
    expect((await row('pending')).avatarKey).toBeNull();
  });

  it('updates display name, bio and category', async () => {
    const res = await patch('creatorA', { displayName: '  Baru  ', bio: 'Halo', category: '' });

    expect(res.statusCode).toBe(200);
    const body = creatorProfileResponseSchema.parse(res.json());
    expect(body).toMatchObject({
      slug: SLUG.creatorA,
      displayName: 'Baru',
      bio: 'Halo',
      category: null,
    });
    expect(await row('creatorA')).toMatchObject({
      displayName: 'Baru',
      bio: 'Halo',
      category: null,
    });

    const mine = await getMine('creatorA');
    expect(mine.statusCode).toBe(200);
    expect(mine.headers['cache-control']).toBe('no-store');
    expect(mine.json()).toEqual(body);
  });

  it('clears the bio with an empty string', async () => {
    await patch('creatorA', { bio: 'Sementara' });
    const res = await patch('creatorA', { bio: '' });
    expect(res.json()).toMatchObject({ bio: null });
  });

  it('never applies non-editable fields', async () => {
    const before = await row('creatorA');
    const res = await patch('creatorA', {
      displayName: 'Tetap',
      slug: 'hijacked-slug',
      status: 'REJECTED',
      avatarKey: 'profile-images/evil',
      userId: USERS.creatorB,
    });

    expect(res.statusCode).toBe(200);
    const after = await row('creatorA');
    expect(after).toMatchObject({
      displayName: 'Tetap',
      slug: before.slug,
      status: 'APPROVED',
      avatarKey: before.avatarKey,
      userId: USERS.creatorA,
    });
  });

  it('rejects empty and invalid updates', async () => {
    for (const payload of [
      {},
      { displayName: '' },
      { bio: 'a'.repeat(501) },
      { slug: 'only-slug' },
    ]) {
      const res = await patch('creatorA', payload);
      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_FAILED');
    }
  });

  it('only ever changes the caller’s own profile', async () => {
    const before = await row('creatorB');
    await patch('creatorA', { displayName: 'A lagi', bio: 'bio A' });
    await upload('creatorA', 'avatar', PNG);
    await upload('creatorA', 'banner', JPEG, 'image/jpeg');
    expect(await row('creatorB')).toEqual(before);
  });

  it('requires the Origin header with the session cookie (CSRF)', async () => {
    const res = await patch('creatorA', { bio: 'x' }, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
    const put = await upload('creatorA', 'avatar', PNG, 'image/png', 'https://evil.example');
    expect(put.statusCode).toBe(403);
  });

  describe('image uploads', () => {
    it('stores an avatar privately and returns its public URL', async () => {
      const res = await upload('creatorA', 'avatar', PNG);

      expect(res.statusCode).toBe(200);
      const { avatarUrl } = creatorProfileResponseSchema.parse(res.json());
      expect(avatarUrl).toMatch(
        new RegExp(`^/api/v1/creators/${SLUG.creatorA}/images/[0-9a-f-]{36}$`),
      );
      const { avatarKey } = await row('creatorA');
      expect(avatarKey).toBe(`profile-images/${avatarUrl!.split('/').pop()}`);
      expect(memory.objects.get(avatarKey!)).toEqual({
        body: new Uint8Array(PNG),
        contentType: 'image/png',
      });
    });

    it('stores the detected type, not the client content-type', async () => {
      const res = await upload('creatorA', 'banner', JPEG, 'image/png');
      expect(res.statusCode).toBe(200);
      const { bannerKey } = await row('creatorA');
      expect(memory.objects.get(bannerKey!)?.contentType).toBe('image/jpeg');
    });

    it.each([
      ['GIF', GIF, 'image/gif'],
      ['SVG', SVG, 'image/svg+xml'],
      ['text labelled as PNG', Buffer.from('not an image'), 'image/png'],
      ['plain text', 'hello', 'text/plain'],
      ['JSON', JSON.stringify({ a: 1 }), 'application/json'],
    ])('rejects %s with 415 and stores nothing', async (_name, body, contentType) => {
      const before = await row('creatorA');
      const count = memory.objects.size;

      const res = await upload('creatorA', 'avatar', body, contentType);

      expect(res.statusCode).toBe(415);
      expect(errorOf(res).code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(memory.objects.size).toBe(count);
      expect((await row('creatorA')).avatarKey).toBe(before.avatarKey);
    });

    it.each([
      ['avatar', PROFILE_IMAGE_MAX_BYTES.avatar + 1],
      ['banner', PROFILE_IMAGE_MAX_BYTES.banner + 1],
    ])('rejects a %s over the limit with 413', async (kind, size) => {
      const before = await row('creatorA');
      const count = memory.objects.size;

      const res = await upload('creatorA', kind, pngOfSize(size));

      expect(res.statusCode).toBe(413);
      expect(errorOf(res).code).toBe('FILE_TOO_LARGE');
      expect(memory.objects.size).toBe(count);
      expect(await row('creatorA')).toMatchObject({
        avatarKey: before.avatarKey,
        bannerKey: before.bannerKey,
      });
    });

    it('accepts a banner larger than the avatar limit', async () => {
      const res = await upload('creatorA', 'banner', pngOfSize(3 * 1024 * 1024));
      expect(res.statusCode).toBe(200);
    });

    it('rejects an unknown image kind', async () => {
      const res = await upload('creatorA', 'cover', PNG);
      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_FAILED');
    });

    it('replaces the previous image and deletes the old object', async () => {
      await upload('creatorA', 'avatar', PNG);
      const { avatarKey: first } = await row('creatorA');

      await upload('creatorA', 'avatar', JPEG, 'image/jpeg');
      const { avatarKey: second } = await row('creatorA');

      expect(second).not.toBe(first);
      await expect.poll(() => memory.objects.has(first!)).toBe(false);
      expect(memory.objects.has(second!)).toBe(true);
    });

    it('still succeeds when deleting the old object fails', async () => {
      await upload('creatorA', 'avatar', PNG);
      memory.failNext.delete = true;
      const res = await upload('creatorA', 'avatar', PNG);
      expect(res.statusCode).toBe(200);
    });

    it('keeps the current key when storage fails', async () => {
      const before = await row('creatorA');
      memory.failNext.put = true;

      const res = await upload('creatorA', 'avatar', PNG);

      expect(res.statusCode).toBe(500);
      expect(errorOf(res).code).toBe('INTERNAL_ERROR');
      expect((await row('creatorA')).avatarKey).toBe(before.avatarKey);
    });
  });

  describe('public images', () => {
    it('serves the current avatar without login, cached as immutable', async () => {
      const { avatarUrl } = creatorProfileResponseSchema.parse(
        (await upload('creatorA', 'avatar', PNG)).json(),
      );

      const res = await publicGet(avatarUrl!);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.rawPayload.equals(PNG)).toBe(true);
      expect(
        (await publicGet(avatarUrl!.replace(SLUG.creatorA, SLUG.creatorA.toUpperCase())))
          .statusCode,
      ).toBe(200);
    });

    it('does not serve replaced images, other creators’ images or bad ids', async () => {
      const { avatarUrl: old } = creatorProfileResponseSchema.parse(
        (await upload('creatorA', 'avatar', PNG)).json(),
      );
      const { avatarUrl: current } = creatorProfileResponseSchema.parse(
        (await upload('creatorA', 'avatar', JPEG, 'image/jpeg')).json(),
      );
      const imageId = current!.split('/').pop()!;

      for (const url of [
        old!,
        `/api/v1/creators/${SLUG.creatorB}/images/${imageId}`,
        `/api/v1/creators/${SLUG.creatorA}/images/not-a-uuid`,
        `/api/v1/creators/${SLUG.creatorA}/images/0190a000-0000-7000-8000-000000000000`,
      ]) {
        const res = await publicGet(url);
        expect(res.statusCode).toBe(404);
        expect(errorOf(res).code).toBe('NOT_FOUND');
      }
    });

    it('does not serve images of a creator who is no longer approved', async () => {
      const { avatarUrl } = creatorProfileResponseSchema.parse(
        (await upload('creatorB', 'avatar', PNG)).json(),
      );
      await prisma.creatorProfile.update({
        where: { userId: USERS.creatorB },
        data: { status: 'REJECTED' },
      });
      try {
        expect((await publicGet(avatarUrl!)).statusCode).toBe(404);
      } finally {
        await prisma.creatorProfile.update({
          where: { userId: USERS.creatorB },
          data: { status: 'APPROVED' },
        });
      }
    });
  });
});
