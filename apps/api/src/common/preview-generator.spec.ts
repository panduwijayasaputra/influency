import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PreviewGenerator } from './preview-generator.js';

const generator = new PreviewGenerator();

/** Raw RGB image from a pixel function, as PNG. */
function image(width: number, height: number, pixel: (x: number, y: number) => number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      raw.fill(pixel(x, y), (y * width + x) * 3, (y * width + x + 1) * 3);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function pixels(file: Buffer) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

function stddev(data: Buffer): number {
  const mean = data.reduce((sum, v) => sum + v, 0) / data.length;
  return Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length);
}

const checkerboard = () => image(512, 512, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));
const flatGray = () => image(512, 512, () => 128);
const quadrants = (size: number) =>
  image(size, size, (x, y) => (x < size / 2 === y < size / 2 ? 0 : 255));
const isWebp = (file: Buffer) =>
  file.subarray(0, 4).toString('latin1') === 'RIFF' &&
  file.subarray(8, 12).toString('latin1') === 'WEBP';

describe('PreviewGenerator.blurred', () => {
  it('writes a WebP no larger than 320 px', async () => {
    const out = await generator.blurred(await image(1200, 600, (x) => x % 256));
    expect(isWebp(out)).toBe(true);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(160);
  });

  it('destroys fine detail: a 1 px checkerboard and flat gray give the same preview', async () => {
    const source = await pixels(await checkerboard());
    expect(stddev(source.data)).toBeGreaterThan(120);
    const a = await pixels(await generator.blurred(await checkerboard()));
    const b = await pixels(await generator.blurred(await flatGray()));
    expect(stddev(a.data)).toBeLessThan(10);
    const meanDiff =
      a.data.reduce((sum, v, i) => sum + Math.abs(v - b.data[i]!), 0) / a.data.length;
    expect(meanDiff).toBeLessThan(4);
  });

  it('applies EXIF orientation and strips metadata', async () => {
    const source = await sharp(await image(200, 100, () => 90))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: 'secret' } })
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const meta = await sharp(await generator.blurred(source)).metadata();
    expect(meta.height).toBeGreaterThan(meta.width);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it('rejects undecodable bytes', async () => {
    const fake = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);
    await expect(generator.blurred(fake)).rejects.toThrow();
  });
});

describe('PreviewGenerator.clear', () => {
  it('downscales to 640 px and keeps large features', async () => {
    const out = await generator.clear(await quadrants(1024));
    expect(isWebp(out)).toBe(true);
    const { data, info } = await pixels(out);
    expect(info.width).toBe(640);
    expect(stddev(data)).toBeGreaterThan(100);
  });

  it('does not enlarge small sources', async () => {
    const meta = await sharp(await generator.clear(await quadrants(300))).metadata();
    expect(meta.width).toBe(300);
  });
});
