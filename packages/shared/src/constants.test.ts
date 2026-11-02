import { describe, expect, it } from 'vitest';
import { API_PREFIX, APP_NAME } from './index.js';

describe('shared constants', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('Influency');
  });

  it('exposes the API prefix without a leading slash', () => {
    expect(API_PREFIX).toBe('api/v1');
  });
});
