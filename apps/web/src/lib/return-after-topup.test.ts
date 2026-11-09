import { afterEach, describe, expect, it } from 'vitest';
import { recallReturnTo, rememberReturnTo } from './return-after-topup';

afterEach(() => sessionStorage.clear());

describe('return after top-up', () => {
  it('remembers a same-origin path from ?returnTo', () => {
    rememberReturnTo('?returnTo=%2Fana%2Fposts%2Fp1');
    expect(recallReturnTo()).toBe('/ana/posts/p1');
  });

  it('ignores an off-site or missing returnTo', () => {
    rememberReturnTo('?returnTo=https%3A%2F%2Fevil.example');
    rememberReturnTo('?returnTo=%2F%2Fevil.example');
    rememberReturnTo('');
    expect(recallReturnTo()).toBeNull();
  });
});
