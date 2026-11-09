import { describe, expect, it } from 'vitest';
import { encodeLibraryCursor, libraryCursorSchema, libraryPageSql } from './library-query.js';

const ID = '0190a000-0000-7000-8000-000000450001';
const USER = '0190a000-0000-7000-8000-000000450002';
const base = { relation: 'all', media: 'all', sort: 'recent' } as const;

describe('library cursor', () => {
  it('round-trips through the schema', () => {
    const cursor = encodeLibraryCursor({ addedMs: 1_762_646_400_123, id: ID });
    expect(cursor).toBe(`1762646400123_${ID}`);
    expect(libraryCursorSchema.parse(cursor)).toBe(cursor);
  });

  it.each(['', 'abc', '123', `abc_${ID}`, `123_not-a-uuid`, `-5_${ID}`, `123_${ID}_x`])(
    'rejects %j',
    (bad) => {
      expect(libraryCursorSchema.safeParse(bad).success).toBe(false);
    },
  );
});

describe('libraryPageSql', () => {
  it('binds every value and never inlines user text', () => {
    const q = libraryPageSql(
      USER,
      { ...base, creator: "x'; DROP TABLE posts; --", cursor: `5_${ID}` },
      13,
    );
    expect(q.sql).not.toContain('DROP TABLE');
    expect(q.sql).not.toContain(USER);
    expect(q.values).toEqual(
      expect.arrayContaining([USER, "x'; DROP TABLE posts; --", 5n, ID, 13]),
    );
  });

  it('uses the keyset comparison and order of the chosen sort', () => {
    const recent = libraryPageSql(USER, { ...base, cursor: `5_${ID}` }, 3).sql;
    expect(recent).toContain('(added_ms, post_id) <');
    expect(recent).toContain('ORDER BY added_ms DESC, post_id DESC');
    const oldest = libraryPageSql(USER, { ...base, sort: 'oldest', cursor: `5_${ID}` }, 3).sql;
    expect(oldest).toContain('(added_ms, post_id) >');
    expect(oldest).toContain('ORDER BY added_ms ASC, post_id ASC');
  });

  it('adds the relation and media filters only when asked', () => {
    expect(libraryPageSql(USER, base, 3).sql).not.toMatch(/AND ps\.id IS NOT NULL|media_assets/);
    expect(libraryPageSql(USER, { ...base, relation: 'saved' }, 3).sql).toContain(
      'AND ps.id IS NOT NULL',
    );
    expect(libraryPageSql(USER, { ...base, relation: 'purchased' }, 3).sql).toContain(
      'AND pp.id IS NOT NULL',
    );
    expect(libraryPageSql(USER, { ...base, media: 'video' }, 3).sql).toContain('media_assets');
  });
});
