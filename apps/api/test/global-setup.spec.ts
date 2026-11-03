import { describe, expect, it } from 'vitest';
import { assertSafeTestDatabaseUrl } from './global-setup.js';

const dev = 'postgresql://u:p@localhost:5432/influency';

describe('assertSafeTestDatabaseUrl', () => {
  it('rejects a missing URL', () => {
    expect(() => assertSafeTestDatabaseUrl(undefined, dev)).toThrow(/TEST_DATABASE_URL is not set/);
  });

  it('rejects a database name without the _test suffix', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://u:p@localhost:5432/influency_dev', dev),
    ).toThrow(/_test/);
  });

  it('rejects the dev database', () => {
    const same = 'postgresql://u:p@localhost:5432/app_test';
    expect(() => assertSafeTestDatabaseUrl(same, same)).toThrow(/must not point at/);
  });

  it('accepts a separate *_test database', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://u:p@localhost:5432/influency_test', dev),
    ).not.toThrow();
  });
});
