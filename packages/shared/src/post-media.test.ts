import { describe, expect, it } from 'vitest';
import { createMediaUploadSchema, POST_IMAGE_MAX_BYTES } from './index.js';

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

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', ''])('rejects %s', (contentType) => {
    expect(messageOf({ contentType, byteSize: 1 })).toEqual([
      'Format gambar harus JPEG, PNG, atau WebP.',
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
