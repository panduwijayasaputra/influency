import { describe, expect, it } from 'vitest';
import {
  createMediaUploadSchema,
  mediaKindOf,
  MEDIA_REJECTION_REASONS,
  mediaUploadResponseSchema,
  POST_IMAGE_MAX_BYTES,
  POST_MEDIA_MAX_PER_POST,
  reorderPostMediaSchema,
  POST_VIDEO_MAX_BYTES,
  studioMediaSchema,
} from './index.js';

const messageOf = (input: unknown) => {
  const result = createMediaUploadSchema.safeParse(input);
  return result.success ? null : result.error.issues.map((issue) => issue.message);
};

describe('createMediaUploadSchema', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (contentType) => {
    expect(createMediaUploadSchema.parse({ contentType, byteSize: 1 })).toEqual({
      contentType,
      byteSize: 1,
    });
  });

  it('accepts exactly the max size', () => {
    expect(
      createMediaUploadSchema.parse({ contentType: 'image/png', byteSize: POST_IMAGE_MAX_BYTES })
        .byteSize,
    ).toBe(POST_IMAGE_MAX_BYTES);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'video/avi', ''])(
    'rejects %s',
    (contentType) => {
      expect(messageOf({ contentType, byteSize: 1 })).toEqual([
        'Format harus JPEG, PNG, WebP, MP4, MOV, atau WebM.',
      ]);
    },
  );

  it.each(['video/mp4', 'video/quicktime', 'video/webm'])(
    'accepts %s up to the video max size',
    (contentType) => {
      expect(
        createMediaUploadSchema.parse({ contentType, byteSize: POST_VIDEO_MAX_BYTES }).byteSize,
      ).toBe(POST_VIDEO_MAX_BYTES);
    },
  );

  it('rejects a video over its max size on byteSize', () => {
    const result = createMediaUploadSchema.safeParse({
      contentType: 'video/mp4',
      byteSize: POST_VIDEO_MAX_BYTES + 1,
    });
    expect(result.success ? null : result.error.issues).toMatchObject([
      { path: ['byteSize'], message: 'Ukuran video maksimal 200 MB.' },
    ]);
  });

  it('rejects a file over the max size with the Bahasa message', () => {
    expect(messageOf({ contentType: 'image/png', byteSize: POST_IMAGE_MAX_BYTES + 1 })).toEqual([
      'Ukuran gambar maksimal 10 MB.',
    ]);
  });

  it.each([0, -1, 1.5, '100'])('rejects byteSize %s', (byteSize) => {
    expect(messageOf({ contentType: 'image/png', byteSize })).not.toBeNull();
  });

  it('strips unknown keys such as objectKey', () => {
    expect(
      createMediaUploadSchema.parse({ contentType: 'image/png', byteSize: 5, objectKey: 'x' }),
    ).toEqual({ contentType: 'image/png', byteSize: 5 });
  });
});

describe('mediaKindOf', () => {
  it('maps video/* to VIDEO and images to IMAGE', () => {
    expect(mediaKindOf('video/webm')).toBe('VIDEO');
    expect(mediaKindOf('image/png')).toBe('IMAGE');
  });
});

describe('mediaUploadResponseSchema', () => {
  const media = {
    id: 'm1',
    kind: 'VIDEO',
    status: 'PENDING_UPLOAD',
    contentType: 'video/mp4',
    byteSize: 1,
    durationSeconds: null,
    rejectionReason: null,
    createdAt: '2026-11-03T00:00:00.000Z',
  };
  const expiresAt = '2026-11-03T00:30:00.000Z';

  it('parses a PUT and a multipart POST upload', () => {
    expect(
      mediaUploadResponseSchema.parse({
        media,
        upload: { url: 'u', method: 'PUT', headers: { 'content-type': 'video/mp4' }, expiresAt },
      }).upload.formField,
    ).toBeUndefined();
    expect(
      mediaUploadResponseSchema.parse({
        media,
        upload: { url: 'u', method: 'POST', headers: {}, formField: 'file', expiresAt },
      }).upload.formField,
    ).toBe('file');
  });
});

describe('studioMediaSchema rejectionReason', () => {
  const base = {
    id: 'm1',
    kind: 'IMAGE',
    status: 'REJECTED',
    contentType: 'image/png',
    byteSize: 1,
    durationSeconds: null,
    createdAt: '2026-11-03T00:00:00.000Z',
  };

  it.each([null, ...MEDIA_REJECTION_REASONS])('accepts %s', (rejectionReason) => {
    expect(studioMediaSchema.parse({ ...base, rejectionReason }).rejectionReason).toBe(
      rejectionReason,
    );
  });

  it('rejects an unknown reason', () => {
    expect(studioMediaSchema.safeParse({ ...base, rejectionReason: 'NOPE' }).success).toBe(false);
  });
});

describe('POST_MEDIA_MAX_PER_POST', () => {
  it('is 5 (design handoff business rule)', () => {
    expect(POST_MEDIA_MAX_PER_POST).toBe(5);
  });
});

describe('reorderPostMediaSchema', () => {
  const id = (n: number) => `0190a000-0000-7000-8000-00000000010${n}`;
  it('accepts a list of media ids', () => {
    expect(reorderPostMediaSchema.parse({ mediaIds: [id(2), id(1)] })).toEqual({
      mediaIds: [id(2), id(1)],
    });
  });
  it.each([
    ['an empty list', { mediaIds: [] }],
    ['a malformed id', { mediaIds: ['nope'] }],
    ['no list', {}],
    ['an extra key', { mediaIds: [id(1)], position: 1 }],
    ['an over-long list', { mediaIds: Array.from({ length: 51 }, () => id(1)) }],
  ])('rejects %s', (_label, input) => {
    expect(reorderPostMediaSchema.safeParse(input).success).toBe(false);
  });
});
