import { describe, expect, it } from 'vitest';
import {
  encodeNameCursor,
  encodeRecentCursor,
  followingCursorSchema,
  parseNameCursor,
  parseRecentCursor,
} from './following-order.js';

const ID = '0190a000-0000-7000-8000-000000460001';

describe('following cursors', () => {
  it('round-trips a "recent" cursor', () => {
    const createdAt = new Date('2026-11-09T01:02:03.456Z');
    const cursor = encodeRecentCursor({ createdAt, id: ID });
    expect(followingCursorSchema.safeParse(cursor).success).toBe(true);
    expect(parseRecentCursor(cursor)).toEqual({ createdAt, id: ID });
    expect(parseNameCursor(cursor)).toBeNull();
  });

  it('round-trips a "name" cursor, including accents and empty names', () => {
    for (const sortName of ['ana', 'éka putri', '', "o'brien; drop"]) {
      const cursor = encodeNameCursor({ sortName, id: ID });
      expect(followingCursorSchema.safeParse(cursor).success).toBe(true);
      expect(parseNameCursor(cursor)).toEqual({ sortName, id: ID });
      expect(parseRecentCursor(cursor)).toBeNull();
    }
  });

  it.each(['', 'garbage', `r_abc_${ID}`, `r_1_not-a-uuid`, `n_***_${ID}`, `x_1_${ID}`])(
    'rejects %j',
    (bad) => {
      expect(followingCursorSchema.safeParse(bad).success).toBe(false);
    },
  );
});
