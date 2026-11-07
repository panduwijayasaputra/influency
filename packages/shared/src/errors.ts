import { z } from 'zod';

/** API error codes with their HTTP status and default user-facing message (Bahasa Indonesia). */
export const ERRORS = {
  VALIDATION_FAILED: { status: 400, message: 'Data yang dikirim tidak valid.' },
  AUTH_REQUIRED: { status: 401, message: 'Silakan masuk terlebih dahulu.' },
  FORBIDDEN: { status: 403, message: 'Anda tidak memiliki akses.' },
  CREATOR_NOT_APPROVED: { status: 403, message: 'Profil kreator belum disetujui.' },
  NOT_FOUND: { status: 404, message: 'Data tidak ditemukan.' },
  SLUG_TAKEN: { status: 409, message: 'Alamat ini sudah dipakai. Pilih alamat lain.' },
  CREATOR_APPLICATION_EXISTS: { status: 409, message: 'Anda sudah memiliki pengajuan kreator.' },
  CREATOR_APPLICATION_NOT_PENDING: { status: 409, message: 'Pengajuan ini sudah diputuskan.' },
  UNSUPPORTED_FILE_TYPE: {
    status: 415,
    message: 'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.',
  },
  FILE_TOO_LARGE: { status: 413, message: 'Ukuran file terlalu besar.' },
  MEDIA_LIMIT_REACHED: { status: 409, message: 'Batas jumlah media per post sudah tercapai.' },
  MEDIA_UPLOAD_MISSING: { status: 409, message: 'File belum terunggah. Coba unggah ulang.' },
  // Limits in these messages mirror POST_VIDEO_MAX_BYTES / POST_VIDEO_MAX_DURATION_SECONDS (post-media.ts).
  VIDEO_PROCESSING_FAILED: {
    status: 422,
    message: 'Video tidak dapat diproses. Gunakan MP4, MOV, atau WebM, maks. 200 MB dan 10 menit.',
  },
  COMMENT_NOT_PINNABLE: { status: 422, message: 'Balasan tidak bisa disematkan.' },
  VIDEO_TOO_LONG: { status: 422, message: 'Durasi video maksimal 10 menit.' },
  OFFER_REQUIRES_PREMIUM: { status: 409, message: 'Harga hanya bisa diatur untuk post Premium.' },
  COVER_REQUIRES_PREMIUM: { status: 409, message: 'Sampul hanya bisa diatur untuk post Premium.' },
  COVER_SOURCE_UNAVAILABLE: {
    status: 409,
    message: 'Sampul belum bisa dibuat dari media ini. Coba lagi nanti.',
  },
  POST_STATUS_CONFLICT: { status: 409, message: 'Status post tidak memungkinkan tindakan ini.' },
  POST_LOCKED: {
    status: 409,
    message: 'Jenis post dan media tidak bisa diubah setelah post terbit.',
  },
  MEDIA_REQUIRED: {
    status: 409,
    message: 'Tambahkan minimal satu foto atau video sebelum mempublikasikan.',
  },
  MEDIA_PROCESSING: { status: 409, message: 'Tunggu hingga semua video selesai diproses.' },
  OFFER_REQUIRED: { status: 409, message: 'Atur harga sebelum mempublikasikan post Premium.' },
  POST_NOT_AVAILABLE: { status: 404, message: 'Postingan tidak tersedia.' },
  CANNOT_REPORT_OWN_POST: {
    status: 403,
    message: 'Anda tidak dapat melaporkan postingan sendiri.',
  },
  USER_STATUS_CONFLICT: { status: 409, message: 'Status akun tidak memungkinkan tindakan ini.' },
  CANNOT_SUSPEND_ADMIN: { status: 409, message: 'Akun admin tidak dapat ditangguhkan.' },
  TOPUP_NOT_FOUND: { status: 404, message: 'Top-up tidak ditemukan.' },
  INSUFFICIENT_COINS: { status: 402, message: 'Saldo Koin tidak cukup.' },
  OFFER_CHANGED: {
    status: 409,
    message: 'Harga atau penawaran telah berubah. Silakan periksa kembali.',
  },
  ALREADY_ENTITLED: { status: 409, message: 'Anda sudah memiliki akses ke konten ini.' },
  DUPLICATE_REQUEST: { status: 409, message: 'Permintaan ganda terdeteksi.' },
  PAYMENT_PENDING: { status: 409, message: 'Pembayaran masih diproses.' },
  PAYOUT_ON_HOLD: { status: 409, message: 'Pencairan sedang ditahan.' },
  PAYMENT_VERIFICATION_FAILED: { status: 400, message: 'Verifikasi pembayaran gagal.' },
  RATE_LIMITED: { status: 429, message: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
  INTERNAL_ERROR: { status: 500, message: 'Terjadi kesalahan pada server. Silakan coba lagi.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

/** Body of every API error response (handoff §11.5). `details` is null when there are none. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).nullable(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
