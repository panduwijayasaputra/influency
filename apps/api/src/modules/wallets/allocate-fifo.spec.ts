import { describe, expect, it } from 'vitest';
import { allocateFifo } from './allocate-fifo.js';

const lots = [
  { id: 'a', unspentCoins: 10n },
  { id: 'b', unspentCoins: 25n },
  { id: 'c', unspentCoins: 50n },
];

describe('allocateFifo', () => {
  it('takes from the oldest lot first', () => {
    expect(allocateFifo(lots, 4n)).toEqual([{ lotId: 'a', coins: 4n }]);
  });

  it('spans lots and stops as soon as the spend is covered', () => {
    expect(allocateFifo(lots, 30n)).toEqual([
      { lotId: 'a', coins: 10n },
      { lotId: 'b', coins: 20n },
    ]);
  });

  it('drains exactly, skipping empty lots', () => {
    expect(allocateFifo([{ id: 'x', unspentCoins: 0n }, ...lots], 85n)).toEqual([
      { lotId: 'a', coins: 10n },
      { lotId: 'b', coins: 25n },
      { lotId: 'c', coins: 50n },
    ]);
  });

  it('throws when the lots are short, and for a non-positive spend', () => {
    expect(() => allocateFifo(lots, 86n)).toThrow(/short by 1 Koin/);
    expect(() => allocateFifo(lots, 0n)).toThrow();
    expect(() => allocateFifo([], 1n)).toThrow();
  });
});
