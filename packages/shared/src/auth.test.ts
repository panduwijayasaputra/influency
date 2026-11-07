import { describe, expect, it } from 'vitest';
import { meResponseSchema } from './auth.js';

describe('meResponseSchema', () => {
  it.each([
    { id: 'u1', displayName: 'Ana', username: 'ana', roles: ['USER', 'ADMIN'] },
    { id: 'u1', displayName: 'Ana', username: null, roles: ['USER'] },
  ])('accepts %j', (me) => {
    expect(meResponseSchema.parse(me)).toEqual(me);
  });

  it.each([
    { id: 'u1', displayName: 'Ana', username: null, roles: ['USER', 'SUPERUSER'] },
    { id: 'u1', displayName: 'Ana', username: null },
    { id: 'u1', displayName: 'Ana', roles: ['USER'] },
  ])('rejects %j', (value) => {
    expect(meResponseSchema.safeParse(value).success).toBe(false);
  });
});
