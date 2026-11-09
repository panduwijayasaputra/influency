import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { DomainError } from './domain-error.js';

const KEY = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

/** The `Idempotency-Key` header, or VALIDATION_FAILED when it is missing or malformed. */
export function parseIdempotencyKey(header: string | string[] | undefined): string {
  const parsed = KEY.safeParse(Array.isArray(header) ? undefined : header);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED', { header: 'Idempotency-Key' });
  return parsed.data;
}

/** JSON with sorted keys, so the same payload always hashes the same. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const requestHash = (body: unknown): string =>
  createHash('sha256').update(stableJson(body)).digest('hex');

export interface ClaimInput {
  userId: string;
  /** What the key is for, e.g. 'topup'. Keys are unique per (user, scope). */
  scope: string;
  key: string;
  requestHash: string;
}

/**
 * Idempotency-Key bookkeeping (handoff §11, backend.md): same key + same payload → the stored result, same key +
 * different payload → DUPLICATE_REQUEST. Runs inside the caller's transaction, so the claim commits together with
 * the business row; the DB unique key is what makes concurrent claims safe.
 */
@Injectable()
export class IdempotencyService {
  async claim(
    tx: Prisma.TransactionClient,
    input: ClaimInput,
  ): Promise<{ status: 'new' } | { status: 'replay'; resultId: string | null }> {
    const inserted = await tx.$executeRaw`
      INSERT INTO idempotency_keys (user_id, scope, key, request_hash)
      VALUES (${input.userId}::uuid, ${input.scope}, ${input.key}, ${input.requestHash})
      ON CONFLICT (user_id, scope, key) DO NOTHING`;
    if (inserted === 1) return { status: 'new' };
    // A concurrent claim holds the row until it commits; this waits for it, then reads the committed result.
    const [row] = await tx.$queryRaw<{ request_hash: string; result_id: string | null }[]>`
      SELECT request_hash, result_id FROM idempotency_keys
      WHERE user_id = ${input.userId}::uuid AND scope = ${input.scope} AND key = ${input.key}
      FOR UPDATE`;
    if (!row) throw new Error('idempotency key vanished after conflict');
    if (row.request_hash !== input.requestHash) throw new DomainError('DUPLICATE_REQUEST');
    return { status: 'replay', resultId: row.result_id };
  }

  async complete(
    tx: Prisma.TransactionClient,
    input: Pick<ClaimInput, 'userId' | 'scope' | 'key'> & { resultId: string },
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE idempotency_keys SET result_id = ${input.resultId}::uuid
      WHERE user_id = ${input.userId}::uuid AND scope = ${input.scope} AND key = ${input.key}`;
  }
}
