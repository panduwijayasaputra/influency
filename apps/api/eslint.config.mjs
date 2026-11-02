import { nestConfig } from '@influency/config/eslint/nest';

export default [{ ignores: ['src/generated/'] }, ...nestConfig(import.meta.dirname)];
