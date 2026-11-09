import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button';

// Tailwind spacing: 11 = 44px, 12 = 48px, 13 = 52px. Every size keeps a ≥44×44 px tap target.
const SIZES = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;
const ICON_SIZES = ['icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;

describe('buttonVariants', () => {
  it.each(SIZES)('size "%s" has a tap target of at least 44px', (size) => {
    expect(buttonVariants({ size })).toMatch(/\b(h|size)-(11|12|13)\b/);
  });

  it('icon sizes are square (44px wide too)', () => {
    for (const size of ICON_SIZES) {
      expect(buttonVariants({ size })).toMatch(/\bsize-(11|12)\b/);
    }
  });

  it('primary buttons are 48px by default and 52px large (design)', () => {
    expect(buttonVariants()).toMatch(/\bh-12\b/);
    expect(buttonVariants({ size: 'lg' })).toMatch(/\bh-13\b/);
  });

  it.each(['default', 'xs', 'sm', 'lg'] as const)('size "%s" is not a pill', (size) => {
    expect(buttonVariants({ size })).not.toMatch(/\brounded-full\b/);
  });
});
