import { z } from 'zod';
import { PROFILE_IMAGE_TYPES } from './creators.js';

/** Placeholder (TBD business decision): accepted post image types, checked by file content — same set as profile images. */
export const POST_IMAGE_TYPES = PROFILE_IMAGE_TYPES;
/** Placeholder (TBD business decision): max bytes per post image (10 MiB). */
export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Placeholder (TBD business decision): accepted post video types (the provider accepts more; keep the list short). */
export const POST_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export type PostVideoType = (typeof POST_VIDEO_TYPES)[number];
/** Placeholder (TBD business decision): max bytes per post video (200 MiB, Cloudflare Stream basic-upload ceiling). */
export const POST_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
/** Placeholder (TBD business decision): max video length, enforced by the provider. */
export const POST_VIDEO_MAX_DURATION_SECONDS = 600;
/** Placeholder (TBD business decision): max media items (images + videos) per post. */
export const POST_MEDIA_MAX_PER_POST = 10;
export const MEDIA_KINDS = ['IMAGE', 'VIDEO'] as const;
export const MEDIA_STATUSES = ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'REJECTED'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/** Media kind of a declared content type (validated by createMediaUploadSchema). */
export const mediaKindOf = (contentType: string): MediaKind =>
  contentType.startsWith('video/') ? 'VIDEO' : 'IMAGE';

/** Body of POST /creators/me/posts/:postId/media. Declared values are re-checked after upload (bytes or provider). */
export const createMediaUploadSchema = z
  .object({
    contentType: z.enum(
      [...POST_IMAGE_TYPES, ...POST_VIDEO_TYPES],
      'Format harus JPEG, PNG, WebP, MP4, MOV, atau WebM.',
    ),
    byteSize: z.number().int().positive(),
  })
  .superRefine(({ contentType, byteSize }, ctx) => {
    const video = mediaKindOf(contentType) === 'VIDEO';
    const max = video ? POST_VIDEO_MAX_BYTES : POST_IMAGE_MAX_BYTES;
    if (byteSize > max)
      ctx.addIssue({
        code: 'custom',
        path: ['byteSize'],
        message: `Ukuran ${video ? 'video' : 'gambar'} maksimal ${max / 1024 / 1024} MB.`,
      });
  });
export type CreateMediaUploadInput = z.infer<typeof createMediaUploadSchema>;

/** A media item of the caller's own post (studio endpoints). */
export const studioMediaSchema = z.object({
  id: z.string(),
  kind: z.enum(MEDIA_KINDS),
  status: z.enum(MEDIA_STATUSES),
  contentType: z.string(),
  byteSize: z.number(),
  /** VIDEO only, once known. */
  durationSeconds: z.number().nullable(),
  createdAt: z.string(),
});
export type StudioMedia = z.infer<typeof studioMediaSchema>;
export const studioMediaListSchema = z.object({ media: z.array(studioMediaSchema) });
export type StudioMediaList = z.infer<typeof studioMediaListSchema>;

/**
 * Response of POST /creators/me/posts/:postId/media: the pending item + a one-shot upload.
 * PUT = raw body with exactly `headers`; POST = multipart/form-data with the file under `formField`.
 */
export const mediaUploadResponseSchema = z.object({
  media: studioMediaSchema,
  upload: z.object({
    url: z.string(),
    method: z.enum(['PUT', 'POST']),
    headers: z.record(z.string(), z.string()),
    formField: z.string().optional(),
    expiresAt: z.string(),
  }),
});
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
