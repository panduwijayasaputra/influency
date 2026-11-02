// ESLint flat config for NestJS apps.
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { baseConfig } from './base.mjs';

/** @param {string} tsconfigRootDir directory of the app's tsconfig.json */
export function nestConfig(tsconfigRootDir) {
  return defineConfig([
    ...baseConfig(tsconfigRootDir),
    {
      languageOptions: { globals: globals.node },
      rules: {
        // NestJS modules are decorated empty classes.
        '@typescript-eslint/no-extraneous-class': 'off',
      },
    },
  ]);
}
