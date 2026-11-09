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
  /** Profile text (users.bio); null until Edit Profil exists. */
  bio: z.string().nullable(),
  /** Slug of the user's APPROVED creator profile, else null (a pending applicant has none). */
  creatorSlug: z.string().nullable(),
  /** false until the welcome stepper is finished or skipped (onboarding US-051). */
  onboardingCompleted: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Body of PATCH /me/profile (onboarding Profil step). Strict: nothing but these two fields can be sent. */
export const updateMyProfileSchema = z.strictObject({
  displayName: z
    .string()
    .trim()
    .min(1, 'Masukkan nama tampilan.')
    .max(60, 'Nama tampilan maksimal 60 karakter.'),
  bio: z.string().trim().max(500, 'Bio maksimal 500 karakter.'),
});
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
