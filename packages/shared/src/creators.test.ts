import { describe, expect, it } from 'vitest';
import {
  creatorApplicationResponseSchema,
  creatorApplicationSchema,
  creatorProfileResponseSchema,
  rejectCreatorApplicationSchema,
  RESERVED_SLUGS,
  slugSchema,
  updateCreatorProfileSchema,
} from './index.js';

const RESERVED_MESSAGE = 'Alamat ini dipakai oleh sistem. Pilih alamat lain.';

describe('slugSchema', () => {
  it('trims and lowercases', () => {
    expect(slugSchema.parse('  ClaudiAndreya ')).toBe('claudiandreya');
  });

  it.each(['abc', 'a_b-c', 'user123', '123', 'a'.repeat(30)])('accepts %j', (slug) => {
    expect(slugSchema.parse(slug)).toBe(slug);
  });

  it.each(['ab', 'a'.repeat(31), '-abc', 'abc_', 'a.b', 'a b', 'ab!c', 'éclair', 'robots.txt', ''])(
    'rejects %j',
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it.each([...RESERVED_SLUGS, 'ADMIN', 'Become-Creator'])(
    'rejects reserved %j with a clear message',
    (slug) => {
      const result = slugSchema.safeParse(slug);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(RESERVED_MESSAGE);
    },
  );
});

describe('creatorApplicationSchema', () => {
  const valid = { displayName: 'Claudia', slug: 'claudia', acceptAgreement: true };

  it('accepts a minimal application', () => {
    expect(creatorApplicationSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['missing agreement', { ...valid, acceptAgreement: undefined }],
    ['declined agreement', { ...valid, acceptAgreement: false }],
    ['empty display name', { ...valid, displayName: '   ' }],
    ['long display name', { ...valid, displayName: 'x'.repeat(61) }],
    ['long bio', { ...valid, bio: 'x'.repeat(501) }],
    ['long category', { ...valid, category: 'x'.repeat(51) }],
  ])('rejects %s', (_, input) => {
    expect(creatorApplicationSchema.safeParse(input).success).toBe(false);
  });

  it('explains a missing agreement', () => {
    const result = creatorApplicationSchema.safeParse({ ...valid, acceptAgreement: false });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['acceptAgreement'],
      message: 'Anda harus menyetujui Perjanjian Kreator dan Kebijakan Konten.',
    });
  });
});

describe('rejectCreatorApplicationSchema', () => {
  it('trims the reason', () => {
    expect(rejectCreatorApplicationSchema.parse({ reason: '  Foto tidak jelas ' })).toEqual({
      reason: 'Foto tidak jelas',
    });
  });

  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 'a'.repeat(501) }])(
    'rejects %j',
    (body) => {
      expect(rejectCreatorApplicationSchema.safeParse(body).success).toBe(false);
    },
  );

  it('accepts 500 chars', () => {
    expect(rejectCreatorApplicationSchema.safeParse({ reason: 'a'.repeat(500) }).success).toBe(
      true,
    );
  });
});

describe('creatorApplicationResponseSchema', () => {
  it('accepts a null rejection reason', () => {
    const body = {
      status: 'PENDING_REVIEW',
      displayName: 'A',
      slug: 'abc',
      bio: null,
      category: null,
      submittedAt: '2026-11-03T00:00:00.000Z',
      rejectionReason: null,
    };
    expect(creatorApplicationResponseSchema.parse(body)).toEqual(body);
  });
});

describe('updateCreatorProfileSchema', () => {
  it('rejects an empty update', () => {
    expect(updateCreatorProfileSchema.safeParse({}).success).toBe(false);
  });

  it('trims the display name and rejects an empty one', () => {
    expect(updateCreatorProfileSchema.parse({ displayName: '  Nama  ' })).toEqual({
      displayName: 'Nama',
    });
    expect(updateCreatorProfileSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('accepts an empty bio (cleared by the service) and rejects a too long one', () => {
    expect(updateCreatorProfileSchema.parse({ bio: '' })).toEqual({ bio: '' });
    expect(updateCreatorProfileSchema.safeParse({ bio: 'a'.repeat(501) }).success).toBe(false);
  });

  it('strips fields that are not editable', () => {
    const parsed = updateCreatorProfileSchema.parse({
      displayName: 'A',
      slug: 'other',
      status: 'APPROVED',
      avatarKey: 'x',
    });
    expect(parsed).toEqual({ displayName: 'A' });
  });
});

describe('creatorProfileResponseSchema', () => {
  it('accepts null image URLs', () => {
    const body = {
      slug: 'abc',
      displayName: 'A',
      bio: null,
      category: null,
      avatarUrl: null,
      bannerUrl: null,
    };
    expect(creatorProfileResponseSchema.parse(body)).toEqual(body);
  });
});
