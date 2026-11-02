// ESLint flat config for the Next.js web app.
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { baseConfig } from './base.mjs';

/** @param {string} tsconfigRootDir directory of the app's tsconfig.json */
export function nextConfig(tsconfigRootDir) {
  return defineConfig([
    ...nextVitals,
    ...baseConfig(tsconfigRootDir),
    {
      languageOptions: { globals: { ...globals.browser, ...globals.node } },
    },
  ]);
}
