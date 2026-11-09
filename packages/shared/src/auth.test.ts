import { describe, expect, it } from 'vitest';
import { meResponseSchema, updateMyProfileSchema } from './auth.js';

describe('meResponseSchema', () => {
  it.each([
    {
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER', 'ADMIN'],
      bio: 'Hai',
      creatorSlug: 'ana',
      onboardingCompleted: true,
    },
    {
      id: 'u1',
      displayName: 'Ana',
      username: null,
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: false,
    },
  ])('accepts %j', (me) => {
    expect(meResponseSchema.parse(me)).toEqual(me);
  });

  it.each([
    {
      id: 'u1',
      displayName: 'Ana',
      username: null,
      roles: ['USER', 'SUPERUSER'],
      bio: null,
      creatorSlug: null,
    },
    { id: 'u1', displayName: 'Ana', username: null, roles: ['USER'], creatorSlug: null },
    { id: 'u1', displayName: 'Ana', username: null, roles: ['USER'], bio: null },
    {
      id: 'u1',
      displayName: 'Ana',
      username: null,
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
    }, // onboardingCompleted missing
    { id: 'u1', displayName: 'Ana', username: null },
    { id: 'u1', displayName: 'Ana', roles: ['USER'] },
  ])('rejects %j', (value) => {
    expect(meResponseSchema.safeParse(value).success).toBe(false);
  });
});

describe('updateMyProfileSchema', () => {
  it('trims and accepts an empty bio', () => {
    expect(updateMyProfileSchema.parse({ displayName: '  Bima ', bio: ' ' })).toEqual({
      displayName: 'Bima',
      bio: '',
    });
  });

  it.each([
    [{ displayName: '', bio: '' }],
    [{ displayName: 'x'.repeat(61), bio: '' }],
    [{ displayName: 'Bima', bio: 'x'.repeat(501) }],
    [{ displayName: 'Bima', bio: '', roles: ['ADMIN'] }],
  ])('rejects %j', (input) => {
    expect(updateMyProfileSchema.safeParse(input).success).toBe(false);
  });
});
