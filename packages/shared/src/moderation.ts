import { z } from 'zod';
import { POST_STATUSES, POST_VISIBILITIES } from './posts.js';

/** TBD placeholder list (content policy, handoff §12.4). Labels live in the web app. */
export const POST_REPORT_REASONS = [
  'SPAM',
  'SEXUAL_CONTENT',
  'VIOLENCE',
  'HARASSMENT',
  'ILLEGAL',
  'COPYRIGHT',
  'OTHER',
] as const;
export type PostReportReason = (typeof POST_REPORT_REASONS)[number];

/** Mirrored by the post_reports / moderation_actions note-length CHECKs. */
export const MODERATION_NOTE_MAX_LENGTH = 500;
export const MODERATION_QUEUE_LIMIT = 50;
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

const noteSchema = z
  .string()
  .trim()
  .max(MODERATION_NOTE_MAX_LENGTH, `Catatan maksimal ${MODERATION_NOTE_MAX_LENGTH} karakter.`)
  .optional();

/** Body of POST /posts/:id/report. A note is required for OTHER. */
export const createPostReportSchema = z
  .strictObject({ reason: z.enum(POST_REPORT_REASONS), note: noteSchema })
  .refine((r) => r.reason !== 'OTHER' || !!r.note, {
    path: ['note'],
    message: 'Wajib diisi untuk alasan Lainnya.',
  });
export type CreatePostReportInput = z.infer<typeof createPostReportSchema>;

export const postReportResponseSchema = z.object({ reported: z.literal(true) });
export type PostReportResponse = z.infer<typeof postReportResponseSchema>;

export const MODERATION_POST_ACTIONS = ['dismiss', 'hide', 'unhide', 'remove'] as const;
export type ModerationPostAction = (typeof MODERATION_POST_ACTIONS)[number];

/** Body of every admin moderation action. The note is internal (never shown to users). */
export const moderationActionInputSchema = z.strictObject({ note: noteSchema });
export type ModerationActionInput = z.infer<typeof moderationActionInputSchema>;

export const moderationQueueItemSchema = z.object({
  post: z.object({
    id: z.uuid(),
    status: z.enum(POST_STATUSES),
    visibility: z.enum(POST_VISIBILITIES),
    caption: z.string(),
  }),
  creator: z.object({
    userId: z.uuid(),
    slug: z.string(),
    displayName: z.string(),
    userStatus: z.enum(USER_STATUSES),
  }),
  openReportCount: z.number().int(),
  /** Open reports per reason, most frequent first. */
  reasons: z.array(z.object({ reason: z.enum(POST_REPORT_REASONS), count: z.number().int() })),
  /** Newest open reports (max 5). */
  reports: z.array(
    z.object({
      reason: z.enum(POST_REPORT_REASONS),
      note: z.string().nullable(),
      reporterDisplayName: z.string(),
      createdAt: z.string(),
    }),
  ),
  firstReportedAt: z.string(),
});
export type ModerationQueueItem = z.infer<typeof moderationQueueItemSchema>;

/** GET /admin/moderation: posts with open reports, oldest open report first. */
export const moderationQueueSchema = z.object({ items: z.array(moderationQueueItemSchema) });
export type ModerationQueue = z.infer<typeof moderationQueueSchema>;

export const moderationPostResultSchema = z.object({
  postId: z.uuid(),
  status: z.enum(POST_STATUSES),
  resolvedReports: z.number().int(),
});
export type ModerationPostResult = z.infer<typeof moderationPostResultSchema>;

export const moderationUserResultSchema = z.object({
  userId: z.uuid(),
  status: z.enum(USER_STATUSES),
});
export type ModerationUserResult = z.infer<typeof moderationUserResultSchema>;
