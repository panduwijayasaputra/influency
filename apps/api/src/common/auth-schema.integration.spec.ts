import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../test/prisma.js';

describe('auth_identities', () => {
  const prisma = createTestPrisma();
  const userIds = ['0190a000-0000-7000-8000-00000000a001', '0190a000-0000-7000-8000-00000000a002'];

  afterAll(async () => {
    await prisma.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('rejects a second identity with the same (provider, provider_sub)', async () => {
    for (const id of userIds) await prisma.user.create({ data: { id, displayName: 'Tester' } });
    const identity = { provider: 'TELEGRAM', providerSub: 'schema-spec-sub' } as const;
    await prisma.authIdentity.create({ data: { ...identity, userId: userIds[0]! } });

    await expect(
      prisma.authIdentity.create({ data: { ...identity, userId: userIds[1]! } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
