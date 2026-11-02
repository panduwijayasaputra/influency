import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Placeholder so the app boots in tests; unit tests never connect to it.
    env: { DATABASE_URL: 'postgresql://influency:test@localhost:5432/influency_test' },
  },
});
