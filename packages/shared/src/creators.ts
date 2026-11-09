import { z } from 'zod';
import { PLAN_PRICE_MAX, PLAN_PRICE_MIN } from './constants.js';

/** Top-level route segments that can never be creator slugs. Add every new top-level web route here. */
export const RESERVED_SLUGS = [
  'login',
  'wallet',
  'studio',
  'admin',
  'auth',
  'api',
  'discover',
  'subscriptions',
  'library',
  'terms',
  'privacy',
  'help',
  'become-creator',
  'account',
  'me',
  'notifications',
  'following',
  'welcome',
  'recommended', // GET /creators/recommended would shadow /creators/:slug
] as const;

/** 3–30 chars, a-z 0-9 _ -, starts and ends with a letter/digit. Mirrored by a DB CHECK on creator_profiles.slug. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

/** Placeholder until the Creator Agreement + Content Policy are written (handoff §9.6, TBD). */
export const CREATOR_AGREEMENT_VERSION = 'placeholder-2026-11';

/** Normalizes (trim + lowercase) and validates a creator slug. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    SLUG_PATTERN,
    'Gunakan 3–30 huruf kecil, angka, _ atau -, diawali dan diakhiri huruf atau angka.',
  )
  .refine(
    (slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug),
    'Alamat ini dipakai oleh sistem. Pilih alamat lain.',
  );

/** Body of POST /creators/apply. */
export const creatorApplicationSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Nama tampilan wajib diisi.')
    .max(60, 'Nama tampilan maksimal 60 karakter.'),
  slug: slugSchema,
  bio: z.string().trim().max(500, 'Bio maksimal 500 karakter.').optional(),
  category: z.string().trim().max(50, 'Kategori maksimal 50 karakter.').optional(),
  /** Koin per 30 days; becomes the creator's plan when an admin approves. Optional for older clients. */
  subscriptionPriceCoins: z
    .int('Masukkan angka 10–5.000 Koin.')
    .min(PLAN_PRICE_MIN, 'Masukkan angka 10–5.000 Koin.')
    .max(PLAN_PRICE_MAX, 'Masukkan angka 10–5.000 Koin.')
    .optional(),
  acceptAgreement: z.literal(true, {
    error: 'Anda harus menyetujui Perjanjian Kreator dan Kebijakan Konten.',
  }),
});
export type CreatorApplicationInput = z.infer<typeof creatorApplicationSchema>;

export const CREATOR_APPLICATION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;

/** The caller's creator application (POST /creators/apply, GET /creators/me/application). */
export const creatorApplicationResponseSchema = z.object({
  status: z.enum(CREATOR_APPLICATION_STATUSES),
  displayName: z.string(),
  slug: z.string(),
  bio: z.string().nullable(),
  category: z.string().nullable(),
  /** The price chosen in the application (Koin per 30 days), or null. */
  subscriptionPriceCoins: z.int().nullable(),
  submittedAt: z.string(),
  /** Latest rejection reason; null unless status is REJECTED. */
  rejectionReason: z.string().nullable(),
});
export type CreatorApplicationResponse = z.infer<typeof creatorApplicationResponseSchema>;

/** Body of POST /admin/creators/:id/reject. The reason is shown to the applicant. */
export const rejectCreatorApplicationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Alasan penolakan wajib diisi.')
    .max(500, 'Alasan maksimal 500 karakter.'),
});
export type RejectCreatorApplicationInput = z.infer<typeof rejectCreatorApplicationSchema>;

/** One pending application in GET /admin/creators/applications (`id` = creator profile id). */
export const adminCreatorApplicationSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  slug: z.string(),
  bio: z.string().nullable(),
  category: z.string().nullable(),
  applicantName: z.string(),
  submittedAt: z.string(),
});
export type AdminCreatorApplication = z.infer<typeof adminCreatorApplicationSchema>;
export const adminCreatorApplicationListSchema = z.object({
  applications: z.array(adminCreatorApplicationSchema),
});

/** Response of POST /admin/creators/:id/approve and /reject. */
export const creatorReviewResultSchema = z.object({
  id: z.string(),
  status: z.enum(CREATOR_APPLICATION_STATUSES),
});
export type CreatorReviewResult = z.infer<typeof creatorReviewResultSchema>;

/** Placeholder limits (TBD business decision): allowed profile image types, checked by file content. */
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ProfileImageType = (typeof PROFILE_IMAGE_TYPES)[number];
/** Placeholder limits (TBD business decision): max bytes per profile image kind. */
export const PROFILE_IMAGE_MAX_BYTES = {
  avatar: 2 * 1024 * 1024,
  banner: 5 * 1024 * 1024,
} as const;
export type ProfileImageKind = keyof typeof PROFILE_IMAGE_MAX_BYTES;

/** Body of PATCH /creators/me: any subset of the editable fields; '' clears bio/category. */
export const updateCreatorProfileSchema = creatorApplicationSchema
  .pick({ displayName: true, bio: true, category: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Tidak ada perubahan.');
export type UpdateCreatorProfileInput = z.infer<typeof updateCreatorProfileSchema>;

/** The caller's creator profile (GET/PATCH /creators/me, PUT /creators/me/avatar|banner). Image URLs are relative API paths. */
export const creatorProfileResponseSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  category: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
});
export type CreatorProfileResponse = z.infer<typeof creatorProfileResponseSchema>;

/** Most creators GET /creators/recommended returns (Home "Creator untukmu"). */
export const RECOMMENDED_CREATORS_LIMIT = 15;

/** A suggested creator: public fields only. */
export const recommendedCreatorSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  followerCount: z.int(),
});
export type RecommendedCreator = z.infer<typeof recommendedCreatorSchema>;

export const recommendedCreatorListSchema = z.object({
  creators: z.array(recommendedCreatorSchema),
});

/** GET/PUT/DELETE /creators/:slug/follow (US-024). Follower count covers ACTIVE users only. */
export const followStateSchema = z.object({ following: z.boolean(), followerCount: z.int() });
export type FollowState = z.infer<typeof followStateSchema>;
