import { describe, expect, it } from 'vitest';
import {
  createPostReportSchema,
  MODERATION_NOTE_MAX_LENGTH,
  moderationActionInputSchema,
} from './index.js';

describe('createPostReportSchema', () => {
  it('accepts a reason with an optional trimmed note', () => {
    expect(createPostReportSchema.parse({ reason: 'SPAM' })).toEqual({ reason: 'SPAM' });
    expect(createPostReportSchema.parse({ reason: 'SPAM', note: '  iklan  ' })).toEqual({
      reason: 'SPAM',
      note: 'iklan',
    });
  });

  it('rejects an unknown reason and extra keys', () => {
    expect(createPostReportSchema.safeParse({ reason: 'BORING' }).success).toBe(false);
    expect(createPostReportSchema.safeParse({ reason: 'SPAM', postId: 'x' }).success).toBe(false);
  });

  it('requires a note for OTHER', () => {
    expect(createPostReportSchema.safeParse({ reason: 'OTHER' }).success).toBe(false);
    expect(createPostReportSchema.safeParse({ reason: 'OTHER', note: '   ' }).success).toBe(false);
    expect(createPostReportSchema.safeParse({ reason: 'OTHER', note: 'alasan' }).success).toBe(
      true,
    );
  });

  it('accepts the max note length and rejects one more', () => {
    const max = 'a'.repeat(MODERATION_NOTE_MAX_LENGTH);
    expect(createPostReportSchema.safeParse({ reason: 'SPAM', note: max }).success).toBe(true);
    expect(createPostReportSchema.safeParse({ reason: 'SPAM', note: `${max}a` }).success).toBe(
      false,
    );
  });
});

describe('moderationActionInputSchema', () => {
  it('accepts an empty body or a note, rejects extra keys', () => {
    expect(moderationActionInputSchema.parse({})).toEqual({});
    expect(moderationActionInputSchema.parse({ note: 'ok' })).toEqual({ note: 'ok' });
    expect(moderationActionInputSchema.safeParse({ status: 'REMOVED' }).success).toBe(false);
  });
});
