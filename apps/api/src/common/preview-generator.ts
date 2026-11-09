import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

// Placeholders (Video Infrastructure v1 §4): tune with real covers. The sample size bounds how much detail survives.
const PREVIEW_SAMPLE_PX = 32;
const PREVIEW_OUTPUT_PX = 320;
const PREVIEW_BLUR_SIGMA = 4;
const PREVIEW_WEBP_QUALITY = 40;
const CLEAR_COVER_PX = 640;
const CLEAR_WEBP_QUALITY = 70;
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Public-safe cover previews: a new, transformed file whose source detail can't be recovered (no CSS blur involved).
 * Output is WebP without metadata (sharp strips it unless asked to keep it). Undecodable input rejects.
 */
@Injectable()
export class PreviewGenerator {
  /** Downscale to PREVIEW_SAMPLE_PX (destroys detail), then upscale to PREVIEW_OUTPUT_PX with a blur, lossy WebP. */
  async blurred(source: Uint8Array): Promise<Buffer> {
    // Two pipelines: sharp applies one resize per pipeline.
    const sample = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(PREVIEW_SAMPLE_PX, PREVIEW_SAMPLE_PX, { fit: 'inside' })
      .toBuffer();
    return sharp(sample)
      .resize(PREVIEW_OUTPUT_PX, PREVIEW_OUTPUT_PX, { fit: 'inside' })
      .blur(PREVIEW_BLUR_SIGMA)
      .webp({ quality: PREVIEW_WEBP_QUALITY })
      .toBuffer();
  }

  /** Curated safe cover only (PREMIUM_COVER_CLEAR_ALLOWED): downscaled to CLEAR_COVER_PX, not blurred. */
  clear(source: Uint8Array): Promise<Buffer> {
    return sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(CLEAR_COVER_PX, CLEAR_COVER_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: CLEAR_WEBP_QUALITY })
      .toBuffer();
  }
}
