import { describe, expect, it } from 'vitest';
import { encodeFeedCursor, feedCursorSchema, feedCursorWhere } from './feed-order.js';

const ID = '0190a000-0000-7000-8000-000000300001';

describe('feed cursor', () => {
  it('round-trips into a keyset filter', () => {
    const at = new Date('2026-11-07T10:00:00.123Z');
    const cursor = encodeFeedCursor({ publishedAt: at, id: ID });
    expect(cursor).toBe(`${at.getTime()}_${ID}`);
    expect(feedCursorSchema.safeParse(cursor).success).toBe(true);
    expect(feedCursorWhere(cursor)).toEqual({
      OR: [{ publishedAt: { lt: at } }, { publishedAt: at, id: { lt: ID } }],
    });
  });

  it.each(['', 'abc', '123', `12_${ID}x`, `-5_${ID}`, `1.5_${ID}`, `12_not-a-uuid`])(
    'rejects %j',
    (bad) => {
      expect(feedCursorSchema.safeParse(bad).success).toBe(false);
    },
  );
});
