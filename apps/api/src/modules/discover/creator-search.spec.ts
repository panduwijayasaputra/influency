import { describe, expect, it } from 'vitest';
import { escapeLike, rankCreatorMatches } from './creator-search.service.js';

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    expect(escapeLike('nadia')).toBe('nadia');
  });
});

const row = (slug: string, displayName = slug) => ({ slug, displayName });

describe('rankCreatorMatches', () => {
  it('puts the exact slug first, then slug prefixes, then other matches', () => {
    const ranked = rankCreatorMatches('nad', [
      row('linanad', 'Lina'),
      row('nadia', 'Nadia'),
      row('nad', 'Zed'),
      row('nadine', 'Adine'),
      row('xyz', 'Nadya'),
    ]);
    expect(ranked.map((r) => r.slug)).toEqual(['nad', 'nadine', 'nadia', 'linanad', 'xyz']);
  });

  it('breaks ties by display name and leaves the input untouched', () => {
    const rows = [row('b', 'Budi'), row('a', 'Ani')];
    expect(rankCreatorMatches('zz', rows).map((r) => r.slug)).toEqual(['a', 'b']);
    expect(rows.map((r) => r.slug)).toEqual(['b', 'a']);
  });
});
