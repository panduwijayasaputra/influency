// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const tokens = Object.fromEntries(
  [...rootBlock.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, hex]) => [
    name,
    hex!.toLowerCase(),
  ]),
) as Record<string, string>;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('Light Social theme tokens', () => {
  it('match the design tokens (design/HANDOFF.md)', () => {
    expect(tokens).toMatchObject({
      primary: '#d9584c',
      brand: '#ef8176',
      'primary-ink': '#b4463b',
      accent: '#ffe8e2',
      koin: '#d6a443',
      'koin-surface': '#fff6e5',
      'koin-foreground': '#6b4a0e',
      background: '#fafafa',
      card: '#ffffff',
      foreground: '#25262b',
      'muted-foreground': '#6b6b75',
      border: '#ece8e7',
      destructive: '#b42318',
      success: '#1e6b3a',
      'success-surface': '#e6f4ea',
    });
  });

  it.each([
    ['foreground', 'background'],
    ['foreground', 'card'],
    ['foreground', 'muted'],
    ['foreground', 'accent'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['accent-foreground', 'accent'],
    ['primary-ink', 'card'],
    ['primary-ink', 'background'],
    ['primary-ink', 'accent'],
    ['secondary-foreground', 'secondary'],
    ['koin-foreground', 'koin-surface'],
    ['success', 'success-surface'],
    ['success', 'card'],
    ['destructive', 'card'],
    ['destructive', 'background'],
  ])('%s on %s meets WCAG AA (4.5:1)', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('documents the accepted AA exception for filled buttons (white on primary, 3.85:1)', () => {
    const ratio = contrast(tokens['primary-foreground']!, tokens.primary!);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
  });

  it('documents why muted text never sits on accent', () => {
    expect(contrast(tokens['muted-foreground']!, tokens.accent!)).toBeLessThan(4.5);
  });

  it('documents why brand coral never carries white text', () => {
    expect(contrast('#ffffff', tokens.brand!)).toBeLessThan(3);
  });

  it('has no dark theme', () => {
    expect(css).not.toMatch(/color-scheme:\s*dark/);
    expect(css).not.toContain('@custom-variant dark');
  });
});
