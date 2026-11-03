import { describe, expect, it } from 'vitest';
import { meResponseSchema } from './auth.js';

describe('meResponseSchema', () => {
  it('accepts a user with known roles', () => {
    const me = { id: 'u1', displayName: 'Ana', roles: ['USER', 'ADMIN'] };
    expect(meResponseSchema.parse(me)).toEqual(me);
  });

  it.each([
    { id: 'u1', displayName: 'Ana', roles: ['USER', 'SUPERUSER'] },
    { id: 'u1', displayName: 'Ana' },
  ])('rejects %j', (value) => {
    expect(meResponseSchema.safeParse(value).success).toBe(false);
  });
});
