import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { createApp } from '../../app.factory.js';
import { PostAccessService } from './post-access.service.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000230001',
  stranger: '0190a000-0000-7000-8000-000000230002',
  admin: '0190a000-0000-7000-8000-000000230003',
  suspended: '0190a000-0000-7000-8000-000000230004',
} as const;

describe('PostAccessService.check', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;
  let access: PostAccessService;
  const posts: Record<string, string> = {};

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Access ${name}`,
        status: name === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
      })),
    });
    await prisma.userRole.create({ data: { userId: USERS.admin, role: 'ADMIN' } });
    const profile = async (name: 'creator' | 'suspended') =>
      (
        await prisma.creatorProfile.create({
          data: {
            userId: USERS[name],
            slug: `access-spec-${name}`,
            status: 'APPROVED',
            ...profileFields(name),
          },
        })
      ).id;
    const creatorId = await profile('creator');
    const suspendedId = await profile('suspended');
    const post = async (
      key: string,
      creatorProfileId: string,
      visibility: 'FREE' | 'PREMIUM',
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED',
    ) => {
      posts[key] = (
        await prisma.post.create({
          data: {
            creatorProfileId,
            visibility,
            status,
            publishedAt: status === 'DRAFT' ? null : new Date(),
          },
        })
      ).id;
    };
    await post('free', creatorId, 'FREE', 'PUBLISHED');
    await post('premium', creatorId, 'PREMIUM', 'PUBLISHED');
    await post('draft', creatorId, 'PREMIUM', 'DRAFT');
    await post('archived', creatorId, 'FREE', 'ARCHIVED');
    await post('removed', creatorId, 'FREE', 'REMOVED');
    await post('suspendedFree', suspendedId, 'FREE', 'PUBLISHED');

    app = await createApp({ logger: false });
    await app.init();
    access = app.get(PostAccessService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.post.deleteMany({ where: { creatorProfile: { userId: { in: userIds } } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('unknown post → hidden', async () => {
    expect(await access.check(randomUUID(), null)).toBe('hidden');
  });

  it('published free → full, published premium → locked for anonymous and other users', async () => {
    expect(await access.check(posts.free!, null)).toBe('full');
    expect(await access.check(posts.premium!, null)).toBe('locked');
    expect(await access.check(posts.premium!, USERS.stranger)).toBe('locked');
  });

  it('draft and archived posts: full for the owner, hidden for anonymous', async () => {
    for (const key of ['draft', 'archived']) {
      expect(await access.check(posts[key]!, USERS.creator)).toBe('full');
      expect(await access.check(posts[key]!, null)).toBe('hidden');
    }
  });

  it('removed post: hidden for the owner, full for an admin', async () => {
    expect(await access.check(posts.removed!, USERS.creator)).toBe('hidden');
    expect(await access.check(posts.removed!, USERS.admin)).toBe('full');
  });

  it('creator with a suspended user → hidden from the public', async () => {
    expect(await access.check(posts.suspendedFree!, null)).toBe('hidden');
  });
});
