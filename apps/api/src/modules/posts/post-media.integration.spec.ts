import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  mediaUploadResponseSchema,
  POST_IMAGE_MAX_BYTES,
  POST_MEDIA_MAX_PER_POST,
  studioMediaListSchema,
  studioMediaSchema,
} from '@influency/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const UNKNOWN_ID = '0190a000-0000-7000-8000-00000000dead';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1');

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-0000001d0001',
  creatorB: '0190a000-0000-7000-8000-0000001d0002',
  plain: '0190a000-0000-7000-8000-0000001d0003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-media-spec-${name}`;
const POSTS = {
  a: '0190a000-0000-7000-8000-0000001d0101',
  aLimit: '0190a000-0000-7000-8000-0000001d0102',
  aRace: '0190a000-0000-7000-8000-0000001d0103',
  b: '0190a000-0000-7000-8000-0000001d0201',
} as const;

describe('studio post media', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Media ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    const [profileA, profileB] = await Promise.all([
      prisma.creatorProfile.create({
        data: {
          userId: USERS.creatorA,
          slug: 'media-spec-a',
          status: 'APPROVED',
          ...profileFields('A'),
        },
      }),
      prisma.creatorProfile.create({
        data: {
          userId: USERS.creatorB,
          slug: 'media-spec-b',
          status: 'APPROVED',
          ...profileFields('B'),
        },
      }),
    ]);
    await prisma.post.createMany({
      data: [
        { id: POSTS.a, creatorProfileId: profileA.id, visibility: 'PREMIUM' },
        { id: POSTS.aLimit, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.aRace, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.b, creatorProfileId: profileB.id, visibility: 'FREE' },
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

  afterAll(async () => {
    await app.close();
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.mediaAsset.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    // One shared post per creator, and the limit is 5: every test starts with no media.
    await prisma.mediaAsset.deleteMany({ where: { postId: { in: [POSTS.a, POSTS.b] } } });
  });

  const base = (postId: string) => `/api/v1/creators/me/posts/${postId}/media`;
  const cookies = (name?: UserName): Record<string, string> =>
    name ? { influency_session: token(name) } : {};
  const slot = (
    name: UserName | undefined,
    postId: string,
    payload: object = { contentType: 'image/png', byteSize: PNG.length },
    origin = WEB_ORIGIN,
  ) =>
    app.inject({
      method: 'POST',
      url: base(postId),
      headers: { origin },
      cookies: cookies(name),
      payload,
    });
  const complete = (name: UserName | undefined, postId: string, mediaId: string) =>
    app.inject({
      method: 'POST',
      url: `${base(postId)}/${mediaId}/complete`,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
    });
  const list = (name: UserName | undefined, postId: string) =>
    app.inject({ method: 'GET', url: base(postId), cookies: cookies(name) });
  const content = (name: UserName | undefined, postId: string, mediaId: string) =>
    app.inject({
      method: 'GET',
      url: `${base(postId)}/${mediaId}/content`,
      cookies: cookies(name),
    });
  const remove = (name: UserName | undefined, postId: string, mediaId: string) =>
    app.inject({
      method: 'DELETE',
      url: `${base(postId)}/${mediaId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
    });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const keyOf = async (mediaId: string) =>
    (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).objectKey!;

  /** Slot + simulated browser PUT (bytes may exceed the declared size, like a lying client); returns the media id and storage key. */
  const uploaded = async (postId: string, bytes: Buffer, contentType = 'image/png') => {
    const res = await slot('creatorA', postId, {
      contentType,
      byteSize: Math.min(bytes.length, POST_IMAGE_MAX_BYTES),
    });
    expect(res.statusCode).toBe(201);
    const { media } = mediaUploadResponseSchema.parse(res.json());
    const key = await keyOf(media.id);
    memory.objects.set(key, { body: new Uint8Array(bytes), contentType });
    return { id: media.id, key };
  };

  it('issues a short-lived, scoped upload slot to the post owner', async () => {
    const before = Date.now();
    const res = await slot('creatorA', POSTS.a);
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = mediaUploadResponseSchema.parse(res.json());
    expect(Object.keys(res.json<{ media: object }>().media).sort()).toEqual(
      [
        'byteSize',
        'contentType',
        'createdAt',
        'durationSeconds',
        'id',
        'kind',
        'rejectionReason',
        'status',
      ].sort(),
    );
    expect(body.media).toMatchObject({
      kind: 'IMAGE',
      status: 'PENDING_UPLOAD',
      contentType: 'image/png',
    });
    expect(body.upload.method).toBe('PUT');
    expect(body.upload.url).toMatch(/^memory:\/\/upload\/post-media\/[0-9a-f-]{36}$/);
    expect(body.upload.url).toBe(`memory://upload/${await keyOf(body.media.id)}`);
    expect(body.upload.headers).toEqual({ 'content-type': 'image/png' });
    const expires = Date.parse(body.upload.expiresAt) - before;
    expect(expires).toBeGreaterThan(299_000);
    expect(expires).toBeLessThan(310_000);
  });

  it.each([
    [{ contentType: 'image/gif', byteSize: 10 }, 'contentType'],
    [{ contentType: 'image/png', byteSize: POST_IMAGE_MAX_BYTES + 1 }, 'byteSize'],
    [{ contentType: 'image/png', byteSize: 0 }, 'byteSize'],
  ])('rejects slot %j', async (payload, path) => {
    const res = await slot('creatorA', POSTS.a, payload);
    expect(res.statusCode).toBe(400);
    const error = errorOf(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(error.details)).toContain(`"path":"${path}"`);
  });

  it('completes a PNG upload, is idempotent, lists and previews it', async () => {
    const { id } = await uploaded(POSTS.a, PNG);
    const res = await complete('creatorA', POSTS.a, id);
    expect(res.statusCode).toBe(200);
    expect(studioMediaSchema.parse(res.json())).toMatchObject({
      id,
      status: 'READY',
      contentType: 'image/png',
      byteSize: PNG.length,
    });
    expect((await complete('creatorA', POSTS.a, id)).json()).toEqual(res.json());

    const listed = await list('creatorA', POSTS.a);
    expect(listed.headers['cache-control']).toBe('no-store');
    expect(studioMediaListSchema.parse(listed.json()).media.map((m) => m.id)).toContain(id);

    const preview = await content('creatorA', POSTS.a, id);
    expect(preview.statusCode).toBe(200);
    expect(preview.rawPayload).toEqual(PNG);
    expect(preview.headers['content-type']).toBe('image/png');
    expect(preview.headers['cache-control']).toBe('private, no-store');
    expect(preview.headers['x-content-type-options']).toBe('nosniff');
  });

  it('stores the type detected from the bytes, not the declared one', async () => {
    const { id } = await uploaded(POSTS.a, PNG, 'image/jpeg');
    expect((await complete('creatorA', POSTS.a, id)).json()).toMatchObject({
      contentType: 'image/png',
    });
    expect((await content('creatorA', POSTS.a, id)).headers['content-type']).toBe('image/png');
    expect(memory.objects.get(await keyOf(id))?.contentType).toBe('image/png');
  });

  it('moves checked bytes off the upload key, so a later PUT to the still-valid URL changes nothing', async () => {
    const { id, key } = await uploaded(POSTS.a, PNG);
    await complete('creatorA', POSTS.a, id);
    const finalKey = await keyOf(id);
    expect(finalKey).not.toBe(key);
    expect(finalKey).toMatch(/^post-media\/[0-9a-f-]{36}$/);
    await vi.waitFor(() => expect(memory.objects.has(key)).toBe(false));

    memory.objects.set(key, {
      body: new Uint8Array(Buffer.from('<svg/>')),
      contentType: 'image/png',
    });
    expect((await content('creatorA', POSTS.a, id)).rawPayload).toEqual(PNG);
    expect((await complete('creatorA', POSTS.a, id)).json()).toMatchObject({ status: 'READY' });
    expect(await keyOf(id)).toBe(finalKey);
  });

  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['WebP', WEBP, 'image/webp'],
  ])('accepts %s', async (_name, bytes, type) => {
    const { id } = await uploaded(POSTS.a, bytes, type);
    expect((await complete('creatorA', POSTS.a, id)).json()).toMatchObject({
      status: 'READY',
      contentType: type,
    });
  });

  it.each([
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['PDF', Buffer.from('%PDF-1.7')],
    ['GIF', Buffer.from('GIF89a....')],
  ])('rejects %s bytes: deletes the object and marks the row REJECTED', async (_name, bytes) => {
    const { id, key } = await uploaded(POSTS.a, bytes);
    const res = await complete('creatorA', POSTS.a, id);
    expect(res.statusCode).toBe(415);
    expect(errorOf(res).code).toBe('UNSUPPORTED_FILE_TYPE');
    await vi.waitFor(() => expect(memory.objects.has(key)).toBe(false));
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe('REJECTED');
    expect(
      studioMediaListSchema
        .parse((await list('creatorA', POSTS.a)).json())
        .media.find((m) => m.id === id),
    ).toMatchObject({ status: 'REJECTED', rejectionReason: 'UNSUPPORTED_TYPE' });
    expect(errorOf(await complete('creatorA', POSTS.a, id)).code).toBe('MEDIA_UPLOAD_MISSING');
    expect((await content('creatorA', POSTS.a, id)).statusCode).toBe(404);
  });

  it('rejects an oversized object without downloading it', async () => {
    const { id, key } = await uploaded(POSTS.a, Buffer.alloc(POST_IMAGE_MAX_BYTES + 1));
    const getSpy = vi.spyOn(memory.storage, 'get');
    const res = await complete('creatorA', POSTS.a, id);
    expect(res.statusCode).toBe(413);
    expect(errorOf(res).code).toBe('FILE_TOO_LARGE');
    expect(getSpy).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(memory.objects.has(key)).toBe(false));
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe('REJECTED');
  });

  it('returns MEDIA_UPLOAD_MISSING when nothing was uploaded and keeps the slot pending', async () => {
    const res = await slot('creatorA', POSTS.a);
    const { media } = mediaUploadResponseSchema.parse(res.json());
    const done = await complete('creatorA', POSTS.a, media.id);
    expect(done.statusCode).toBe(409);
    expect(errorOf(done).code).toBe('MEDIA_UPLOAD_MISSING');
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).status).toBe(
      'PENDING_UPLOAD',
    );
  });

  it('rejects completing an expired slot', async () => {
    const { id, key } = await uploaded(POSTS.a, PNG);
    await prisma.mediaAsset.update({
      where: { id },
      data: { uploadExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(errorOf(await complete('creatorA', POSTS.a, id)).code).toBe('MEDIA_UPLOAD_MISSING');
    await vi.waitFor(() => expect(memory.objects.has(key)).toBe(false));
  });

  it('enforces the per-post limit; expired pending slots do not count', async () => {
    const ids: string[] = [];
    for (let i = 0; i < POST_MEDIA_MAX_PER_POST; i++) {
      const res = await slot('creatorA', POSTS.aLimit);
      expect(res.statusCode).toBe(201);
      ids.push(mediaUploadResponseSchema.parse(res.json()).media.id);
    }
    const over = await slot('creatorA', POSTS.aLimit);
    expect(over.statusCode).toBe(409);
    expect(errorOf(over).code).toBe('MEDIA_LIMIT_REACHED');

    await prisma.mediaAsset.update({
      where: { id: ids[0] },
      data: { uploadExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await slot('creatorA', POSTS.aLimit)).statusCode).toBe(201);
  });

  it('serializes concurrent slot requests so the limit holds', async () => {
    await prisma.mediaAsset.createMany({
      data: Array.from({ length: POST_MEDIA_MAX_PER_POST - 2 }, (_, i) => ({
        postId: POSTS.aRace,
        kind: 'IMAGE' as const,
        status: 'READY' as const,
        objectKey: `post-media/0190a000-0000-7000-8000-0000001d1${String(i).padStart(3, '0')}`,
        contentType: 'image/png',
        byteSize: 10,
        uploadExpiresAt: new Date(),
      })),
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => slot('creatorA', POSTS.aRace)),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 201, 409, 409, 409]);
  });

  it('deletes media and its object; a second delete is 404; storage failure still deletes the row', async () => {
    const { id } = await uploaded(POSTS.a, PNG);
    await complete('creatorA', POSTS.a, id);
    const key = await keyOf(id);
    expect((await remove('creatorA', POSTS.a, id)).statusCode).toBe(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id } })).toBeNull();
    await vi.waitFor(() => expect(memory.objects.has(key)).toBe(false));
    expect((await remove('creatorA', POSTS.a, id)).statusCode).toBe(404);

    const second = await uploaded(POSTS.a, PNG);
    memory.failNext.delete = true;
    expect((await remove('creatorA', POSTS.a, second.id)).statusCode).toBe(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id: second.id } })).toBeNull();
  });

  it("never exposes or changes another creator's media", async () => {
    const { id } = await uploaded(POSTS.a, PNG);
    await complete('creatorA', POSTS.a, id);
    const key = await keyOf(id);
    const unknown = errorOf(await list('creatorB', UNKNOWN_ID));

    for (const res of [
      await slot('creatorB', POSTS.a),
      await complete('creatorB', POSTS.a, id),
      await list('creatorB', POSTS.a),
      await content('creatorB', POSTS.a, id),
      await remove('creatorB', POSTS.a, id),
      // A's media id under B's own post.
      await content('creatorB', POSTS.b, id),
      await remove('creatorB', POSTS.b, id),
    ]) {
      expect(res.statusCode).toBe(404);
      expect({ ...errorOf(res), requestId: '' }).toEqual({ ...unknown, requestId: '' });
    }
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id } })).status).toBe('READY');
    expect(memory.objects.has(key)).toBe(true);
    expect(
      await prisma.mediaAsset.count({
        where: { postId: POSTS.a, post: { creatorProfile: { userId: USERS.creatorB } } },
      }),
    ).toBe(0);
  });

  it('rejects malformed ids, missing sessions, non-creators and cross-origin writes', async () => {
    expect((await list('creatorA', 'not-a-uuid')).statusCode).toBe(400);
    expect((await content('creatorA', POSTS.a, 'nope')).statusCode).toBe(400);
    expect(errorOf(await list(undefined, POSTS.a)).code).toBe('AUTH_REQUIRED');
    expect(errorOf(await slot('plain', POSTS.a)).code).toBe('CREATOR_NOT_APPROVED');
    const csrf = await slot('creatorA', POSTS.a, undefined, 'https://evil.example');
    expect(csrf.statusCode).toBe(403);
    expect(errorOf(csrf).code).toBe('FORBIDDEN');
  });
});
