import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectImageType, detectVideoType } from './image-type.js';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe('detectImageType', () => {
  it.each([
    ['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0])],
    ['image/png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
    ['image/webp', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ')],
  ])('detects %s from its magic bytes', (type, file) => {
    expect(detectImageType(file)).toBe(type);
  });

  it.each([
    ['GIF', bytes('GIF89a', [0, 0])],
    ['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['RIFF WAVE', bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt ')],
    ['PDF', bytes('%PDF-1.7')],
    ['HTML', bytes('<!doctype html>')],
    ['empty', bytes()],
    ['truncated JPEG', bytes([0xff, 0xd8])],
    ['truncated PNG', bytes([0x89, 0x50, 0x4e, 0x47])],
  ])('rejects %s', (_name, file) => {
    expect(detectImageType(file)).toBeNull();
  });
});

describe('detectVideoType', () => {
  it.each([
    [
      'video/mp4',
      new Uint8Array(readFileSync(new URL('../../test/fixtures/sample.mp4', import.meta.url))),
    ],
    ['video/mp4', bytes([0, 0, 0, 0x18], 'ftypmp42')],
    ['video/quicktime', bytes([0, 0, 0, 0x14], 'ftypqt  ')],
    ['video/webm', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f])],
  ])('detects %s from its container header', (type, file) => {
    expect(detectVideoType(file)).toBe(type);
  });

  it.each([
    ['PNG', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['JPEG', bytes([0xff, 0xd8, 0xff, 0xe0])],
    ['PDF', bytes('%PDF-1.7')],
    ['empty', bytes()],
    ['truncated ftyp', bytes([0, 0, 0, 0x18], 'fty')],
  ])('rejects %s', (_name, file) => {
    expect(detectVideoType(file)).toBeNull();
  });
});
