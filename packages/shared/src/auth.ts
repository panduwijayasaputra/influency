import { z } from 'zod';

/** `?error=` codes the API puts on `/login` after a failed Telegram login. */
export const LOGIN_ERROR_CODES = ['login_cancelled', 'login_failed'] as const;
export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

/** HttpOnly cookie holding the opaque session token (only its hash is stored server-side). */
export const SESSION_COOKIE = 'influency_session';

/** Roles returned by GET /auth/me, in this fixed order. USER is implicit, CREATOR derived, ADMIN granted. */
export const ROLES = ['USER', 'CREATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Body of GET /auth/me. */
export const meResponseSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  /** Telegram username, display only; null when Telegram sent none. */
  username: z.string().nullable(),
  roles: z.array(z.enum(ROLES)),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
