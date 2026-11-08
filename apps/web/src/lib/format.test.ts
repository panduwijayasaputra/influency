import { describe, expect, it } from 'vitest';
import { formatJakartaDate, formatKoin, formatRupiah } from './format';

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
});
