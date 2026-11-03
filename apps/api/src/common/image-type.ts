import type { PostVideoType, ProfileImageType } from '@influency/shared';

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0): boolean =>
  bytes.length >= offset + prefix.length && prefix.every((b, i) => bytes[offset + i] === b);

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/** Detects the image type from file content (never from the file name or client content-type). */
export function detectImageType(bytes: Uint8Array): ProfileImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/** Detects the video container from file content: ISO BMFF `ftyp` (MP4, or MOV with the `qt  ` brand) or WebM's EBML header. */
export function detectVideoType(bytes: Uint8Array): PostVideoType | null {
  if (startsWith(bytes, ascii('ftyp'), 4)) {
    return startsWith(bytes, ascii('qt  '), 8) ? 'video/quicktime' : 'video/mp4';
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  return null;
}
