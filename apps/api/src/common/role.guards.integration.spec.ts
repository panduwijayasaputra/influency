import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../test/creator-profile.js';
import { createTestPrisma } from '../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../app.factory.js';
import { CommonModule } from './common.module.js';
import { sha256hex } from './crypto.js';
import { AdminGuard, ApprovedCreatorGuard } from './role.guards.js';

@Controller('test-roles')
class ProbeController {
  @Get('admin')
  @UseGuards(AdminGuard)
  admin() {
    return { ok: true };
  }

  @Get('studio')
  @UseGuards(ApprovedCreatorGuard)
  studio(@Req() req: FastifyRequest) {
    return { creatorProfileId: req.creatorProfileId };
  }
}

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  plain: '0190a000-0000-7000-8000-0000000b0001',
  admin: '0190a000-0000-7000-8000-0000000b0002',
  approved: '0190a000-0000-7000-8000-0000000b0003',
  pending: '0190a000-0000-7000-8000-0000000b0004',
  rejected: '0190a000-0000-7000-8000-0000000b0005',
  suspendedAdmin: '0190a000-0000-7000-8000-0000000b0006',
};
type UserName = keyof typeof USERS;
const APPROVED_PROFILE = '0190a000-0000-7000-8000-0000000b0011';
const PENDING_PROFILE = '0190a000-0000-7000-8000-0000000b0012';
const tokenOf = (name: UserName) => `role-guard-spec-${name}`;

describe('AdminGuard + ApprovedCreatorGuard', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const names = Object.keys(USERS) as UserName[];
    await prisma.user.createMany({
      data: names.map((name) => ({
        id: USERS[name],
        displayName: `Role ${name}`,
        status: name === 'suspendedAdmin' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      })),
    });
    await prisma.session.createMany({
      data: names.map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(tokenOf(name)),
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    });
    await prisma.userRole.createMany({
      data: [
        { userId: USERS.admin, role: 'ADMIN' },
        { userId: USERS.suspendedAdmin, role: 'ADMIN' },
      ],
    });
    await prisma.creatorProfile.createMany({
      data: [
        {
          id: APPROVED_PROFILE,
          userId: USERS.approved,
          slug: 'role-spec-approved',
          status: 'APPROVED',
          ...profileFields(),
        },
        {
          id: PENDING_PROFILE,
          userId: USERS.pending,
          slug: 'role-spec-pending',
          ...profileFields(),
        },
        {
          userId: USERS.rejected,
          slug: 'role-spec-rejected',
          status: 'REJECTED',
          ...profileFields(),
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      controllers: [ProbeController],
    }).compile();
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
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const get = (path: 'admin' | 'studio', name?: UserName) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/test-roles/${path}`,
      cookies: name ? { influency_session: tokenOf(name) } : {},
    });

  async function expectError(
    res: ReturnType<typeof get>,
    status: number,
    code: string,
  ): Promise<void> {
    const r = await res;
    expect(r.statusCode).toBe(status);
    expect(errorResponseSchema.parse(r.json()).error.code).toBe(code);
  }

  it.each(['admin', 'studio'] as const)('%s: no cookie → 401 AUTH_REQUIRED', async (path) => {
    await expectError(get(path), 401, 'AUTH_REQUIRED');
  });

  it('plain user: admin → 403 FORBIDDEN, studio → 403 CREATOR_NOT_APPROVED', async () => {
    await expectError(get('admin', 'plain'), 403, 'FORBIDDEN');
    await expectError(get('studio', 'plain'), 403, 'CREATOR_NOT_APPROVED');
  });

  it('rejected creator: studio → 403 CREATOR_NOT_APPROVED', async () => {
    await expectError(get('studio', 'rejected'), 403, 'CREATOR_NOT_APPROVED');
  });

  it('approved creator: studio → 200 with its profile id; admin → 403 FORBIDDEN', async () => {
    const res = await get('studio', 'approved');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ creatorProfileId: APPROVED_PROFILE });
    await expectError(get('admin', 'approved'), 403, 'FORBIDDEN');
  });

  it('admin without a profile: admin → 200; studio → 403 CREATOR_NOT_APPROVED', async () => {
    expect((await get('admin', 'admin')).statusCode).toBe(200);
    await expectError(get('studio', 'admin'), 403, 'CREATOR_NOT_APPROVED');
  });

  it('suspended user with an ADMIN row → 401 AUTH_REQUIRED', async () => {
    await expectError(get('admin', 'suspendedAdmin'), 401, 'AUTH_REQUIRED');
  });

  it('reads roles from the DB on every request (same cookie)', async () => {
    await expectError(get('studio', 'pending'), 403, 'CREATOR_NOT_APPROVED');
    await prisma.creatorProfile.update({
      where: { id: PENDING_PROFILE },
      data: { status: 'APPROVED' },
    });
    expect((await get('studio', 'pending')).json()).toEqual({ creatorProfileId: PENDING_PROFILE });

    expect((await get('admin', 'admin')).statusCode).toBe(200);
    await prisma.userRole.deleteMany({ where: { userId: USERS.admin } });
    await expectError(get('admin', 'admin'), 403, 'FORBIDDEN');
  });
});
