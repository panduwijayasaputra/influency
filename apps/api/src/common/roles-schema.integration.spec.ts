import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../test/creator-profile.js';
import { createTestPrisma } from '../../test/prisma.js';

describe('user_roles + creator_profiles constraints', () => {
  const prisma = createTestPrisma();
  const userIds = ['0190a000-0000-7000-8000-0000000c0001', '0190a000-0000-7000-8000-0000000c0002'];
  const [first, second] = userIds as [string, string];

  beforeAll(async () => {
    for (const id of userIds) await prisma.user.create({ data: { id, displayName: 'Tester' } });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('rejects a duplicate (user_id, role)', async () => {
    await prisma.userRole.create({ data: { userId: first, role: 'ADMIN' } });
    await expect(
      prisma.userRole.create({ data: { userId: first, role: 'ADMIN' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a second profile for the same user and a duplicate slug', async () => {
    await prisma.creatorProfile.create({
      data: { userId: first, slug: 'roles-spec-a', ...profileFields() },
    });
    await expect(
      prisma.creatorProfile.create({
        data: { userId: first, slug: 'roles-spec-b', ...profileFields() },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.creatorProfile.create({
        data: { userId: second, slug: 'roles-spec-a', ...profileFields() },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('defaults a new profile to PENDING_REVIEW', async () => {
    const profile = await prisma.creatorProfile.create({
      data: { userId: second, slug: 'roles-spec-c', ...profileFields() },
    });
    expect(profile.status).toBe('PENDING_REVIEW');
  });

  it.each(['Roles-Spec-Upper', 'a.b', '-ab', 'ab', 'admin '])(
    'rejects slug %j (lowercase + format CHECKs)',
    async (slug) => {
      const id = '0190a000-0000-7000-8000-0000000c0003';
      await prisma.user.upsert({ where: { id }, create: { id, displayName: 'T' }, update: {} });
      await expect(
        prisma.creatorProfile.create({ data: { userId: id, slug, ...profileFields() } }),
      ).rejects.toThrow(/creator_profiles_slug_(lowercase|format)/);
      await prisma.user.delete({ where: { id } });
    },
  );
});
