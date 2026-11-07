import { describe, expect, it } from 'vitest';
import { encodeTopCursor, topCursorSchema, topCursorWhere } from './comment-order.js';

const id = '0190a000-0000-7000-8000-000000000001';

describe('top cursor', () => {
  it('round-trips into a keyset filter', () => {
    const cursor = encodeTopCursor({ likeCount: 7, id });
    expect(topCursorSchema.safeParse(cursor).success).toBe(true);
    expect(topCursorWhere(cursor)).toEqual({
      OR: [{ likeCount: { lt: 7 } }, { likeCount: 7, id: { lt: id } }],
    });
  });

  it('rejects malformed cursors', () => {
    for (const bad of ['', id, '-1_' + id, '3_x', '3_' + id + 'a']) {
      expect(topCursorSchema.safeParse(bad).success).toBe(false);
    }
    expect(() => topCursorWhere('nope')).toThrow();
  });
});
