import { describe, expect, it } from 'vitest';
import { toSafeInt } from './bigint.js';

describe('toSafeInt', () => {
  it('converts safe values', () => {
    expect(toSafeInt(0n)).toBe(0);
    expect(toSafeInt(-5n)).toBe(-5);
    expect(toSafeInt(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('throws above the safe range instead of rounding', () => {
    expect(() => toSafeInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
    expect(() => toSafeInt(BigInt(Number.MIN_SAFE_INTEGER) - 1n)).toThrow(RangeError);
  });
});
