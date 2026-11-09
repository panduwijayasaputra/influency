import { describe, expect, it } from 'vitest';
import { type ActivityRow, captionExcerpt, toActivityItem } from './earnings-activity.js';

describe('captionExcerpt', () => {
  it.each([
    ['a single line', 'Rain-day roll', 'Rain-day roll'],
    ['the first non-empty line', '\n\n  Pasar pagi  \nsecond', 'Pasar pagi'],
    ['nothing for an empty caption', '', null],
    ['nothing for blank lines', ' \n \t\n', null],
  ])('%s', (_label, caption, expected) => {
    expect(captionExcerpt(caption)).toBe(expected);
  });

  it('is null for no caption (a tip on the creator)', () => {
    expect(captionExcerpt(null)).toBeNull();
  });

  it('keeps exactly 60 characters and cuts a longer line with an ellipsis', () => {
    expect(captionExcerpt('a'.repeat(60))).toBe('a'.repeat(60));
    expect(captionExcerpt('a'.repeat(61))).toBe(`${'a'.repeat(60)}…`);
  });

  it('counts characters, not UTF-16 units (emoji are not split)', () => {
    const line = '😀'.repeat(61);
    expect(captionExcerpt(line)).toBe(`${'😀'.repeat(60)}…`);
  });
});

describe('toActivityItem', () => {
  const row: ActivityRow = {
    id: '0190a000-0000-7000-8000-000000000001',
    kind: 'SALE',
    source_type: 'POST_PURCHASE',
    amount_idr: 20_000n,
    gross_idr: 25_000n,
    fee_bps: 2000,
    created_ms: 1_762_000_000_000n,
    accrues_ms: 1_761_900_000_000n,
    available: false,
    buyer_name: 'Tari',
    post_caption: 'Hello',
  };

  it('maps a row to the contract', () => {
    expect(toActivityItem(row)).toEqual({
      id: row.id,
      type: 'unlock',
      kind: 'SALE',
      occurredAt: new Date(1_762_000_000_000).toISOString(),
      buyerName: 'Tari',
      postCaption: 'Hello',
      grossKoin: 25,
      feeBps: 2000,
      netIdr: 20_000,
      status: 'PENDING',
      availableAt: new Date(1_761_900_000_000 + 14 * 86_400_000).toISOString(),
    });
  });

  it.each([
    ['POST_PURCHASE', 'unlock'],
    ['SUBSCRIPTION_PERIOD', 'subscription'],
    ['TIP', 'tip'],
  ])('maps the source %s to %s', (source, type) => {
    expect(toActivityItem({ ...row, source_type: source }).type).toBe(type);
  });

  it('keeps a reversal negative and falls back to a generic buyer', () => {
    const item = toActivityItem({
      ...row,
      kind: 'REVERSAL',
      amount_idr: -20_000n,
      buyer_name: null,
      available: true,
    });
    expect(item).toMatchObject({ kind: 'REVERSAL', netIdr: -20_000, buyerName: 'Pengguna' });
    expect(item.status).toBe('AVAILABLE');
  });

  it('throws instead of losing precision beyond 2^53', () => {
    expect(() => toActivityItem({ ...row, amount_idr: 2n ** 60n })).toThrow(RangeError);
  });
});
