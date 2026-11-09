import { describe, expect, it } from 'vitest';
import { daysLeft, daysLeftLabel, formatJakartaDate, formatKoin, formatRupiah } from './format';

describe('format', () => {
  it('formats rupiah and Koin with Indonesian grouping', () => {
    expect(formatRupiah(25000)).toBe('Rp25.000');
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatKoin(1250)).toBe('1.250 Koin');
  });

  it('uses the Asia/Jakarta calendar day across UTC midnight', () => {
    // 2026-11-06 20:00 UTC is already 7 Nov in Jakarta (UTC+7).
    expect(formatJakartaDate('2026-11-06T20:00:00.000Z')).toMatch(/^7 Nov(?:ember)? 2026$/);
  });

  it('counts whole days left, rounding up and never below 0', () => {
    const now = new Date('2026-11-09T00:00:00.000Z');
    expect(daysLeft('2026-11-10T00:00:00.000Z', now)).toBe(1);
    expect(daysLeft('2026-11-09T00:00:00.001Z', now)).toBe(1);
    expect(daysLeft('2026-11-21T00:00:00.000Z', now)).toBe(12);
    expect(daysLeft('2026-11-01T00:00:00.000Z', now)).toBe(0);
  });
});

describe('daysLeftLabel', () => {
  it('says "berakhir hari ini" on the last day and counts days otherwise', () => {
    expect(daysLeftLabel(1)).toBe('Aktif · berakhir hari ini');
    expect(daysLeftLabel(2)).toBe('Aktif · 2 hari lagi');
    expect(daysLeftLabel(30)).toBe('Aktif · 30 hari lagi');
  });
});
