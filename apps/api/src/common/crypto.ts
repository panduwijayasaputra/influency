import { createHash } from 'node:crypto';

/** Hex SHA-256, used to store session tokens and cookie bindings without the raw value. */
export const sha256hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
