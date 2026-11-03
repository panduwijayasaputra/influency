import { z } from 'zod';
import { PROFILE_IMAGE_TYPES } from './creators.js';

/** Placeholder (TBD business decision): accepted post image types, checked by file content — same set as profile images. */
export const POST_IMAGE_TYPES = PROFILE_IMAGE_TYPES;
/** Placeholder (TBD business decision): max bytes per post image (10 MiB). */
export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Placeholder (TBD business decision): max media items per post. */
export const POST_MEDIA_MAX_PER_POST = 10;
export const MEDIA_KINDS = ['IMAGE'] as const;
export const MEDIA_STATUSES = ['PENDING_UPLOAD', 'READY', 'REJECTED'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/** Body of POST /creators/me/posts/:postId/media. Declared values are re-checked from the stored bytes on complete. */
export const createMediaUploadSchema = z.object({
  contentType: z.enum(POST_IMAGE_TYPES, 'Format gambar harus JPEG, PNG, atau WebP.'),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(POST_IMAGE_MAX_BYTES, `Ukuran gambar maksimal ${POST_IMAGE_MAX_BYTES / 1024 / 1024} MB.`),
});
export type CreateMediaUploadInput = z.infer<typeof createMediaUploadSchema>;

/** A media item of the caller's own post (studio endpoints). */
export const studioMediaSchema = z.object({
  id: z.string(),
  kind: z.enum(MEDIA_KINDS),
  status: z.enum(MEDIA_STATUSES),
  contentType: z.string(),
  byteSize: z.number(),
  createdAt: z.string(),
});
export type StudioMedia = z.infer<typeof studioMediaSchema>;
export const studioMediaListSchema = z.object({ media: z.array(studioMediaSchema) });
export type StudioMediaList = z.infer<typeof studioMediaListSchema>;

/** Response of POST /creators/me/posts/:postId/media: the pending item + a presigned PUT (send exactly `headers`). */
export const mediaUploadResponseSchema = z.object({
  media: studioMediaSchema,
  upload: z.object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.string(),
  }),
});
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
