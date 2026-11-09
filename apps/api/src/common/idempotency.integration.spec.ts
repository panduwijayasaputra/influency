import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../test/prisma.js';
import { DomainError } from './domain-error.js';
import { IdempotencyService, parseIdempotencyKey, requestHash } from './idempotency.js';

describe('IdempotencyService', () => {
  const prisma = createTestPrisma();
  const service = new IdempotencyService();
  afterAll(() => prisma.$disconnect());

  const newUser = () => prisma.user.create({ data: { displayName: 'Idem' } });
  const claim = (userId: string, key: string, hash: string) =>
    prisma.$transaction((tx) =>
      service.claim(tx, { userId, scope: 'topup', key, requestHash: hash }),
    );

  it('claims a new key, then replays the stored result for the same payload', async () => {
    const user = await newUser();
    const key = randomUUID();
    const resultId = randomUUID();
    await prisma.$transaction(async (tx) => {
      expect(
        await service.claim(tx, { userId: user.id, scope: 'topup', key, requestHash: 'h1' }),
      ).toEqual({ status: 'new' });
      await service.complete(tx, { userId: user.id, scope: 'topup', key, resultId });
    });
    expect(await claim(user.id, key, 'h1')).toEqual({ status: 'replay', resultId });
  });

  it('rejects the same key with a different payload', async () => {
    const user = await newUser();
    const key = randomUUID();
    await claim(user.id, key, 'h1');
    await expect(claim(user.id, key, 'h2')).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST' });
  });

  it('lets exactly one of several concurrent claims be new', async () => {
    const user = await newUser();
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => claim(user.id, key, 'h1')));
    expect(results.filter((r) => r.status === 'new')).toHaveLength(1);
    expect(await prisma.idempotencyKey.count({ where: { userId: user.id } })).toBe(1);
  });

  it('keeps keys per user and per scope', async () => {
    const a = await newUser();
    const b = await newUser();
    const key = randomUUID();
    expect((await claim(a.id, key, 'h1')).status).toBe('new');
    expect((await claim(b.id, key, 'h2')).status).toBe('new');
  });
});

describe('Idempotency helpers', () => {
  it('hashes the same payload the same regardless of key order', () => {
    expect(requestHash({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      requestHash({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }));
  });

  it('requires a well-formed Idempotency-Key header', () => {
    expect(parseIdempotencyKey('abcd1234-ok_')).toBe('abcd1234-ok_');
    for (const bad of [undefined, '', 'short', 'has space here', 'x'.repeat(129), ['a', 'b']]) {
      expect(() => parseIdempotencyKey(bad as string)).toThrow(DomainError);
    }
  });
});
