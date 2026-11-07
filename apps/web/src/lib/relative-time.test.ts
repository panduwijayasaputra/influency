import { describe, expect, it } from 'vitest';
import { POST_DATE } from '@/app/(public)/[creatorSlug]/premium-cover';
import { formatRelativeTime } from './relative-time';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();
const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });

describe('formatRelativeTime', () => {
  it.each([
    [30, 'baru saja'],
    [5 * 60, rtf.format(-5, 'minute')],
    [2 * 3600, rtf.format(-2, 'hour')],
    [3 * 86_400, rtf.format(-3, 'day')],
  ])('%i seconds ago → %s', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), NOW)).toBe(expected);
  });

  it('shows the date for posts a week or older', () => {
    expect(formatRelativeTime(ago(10 * 86_400), NOW)).toBe(
      POST_DATE.format(new Date(ago(10 * 86_400))),
    );
  });

  it('treats a future timestamp (clock skew) as just now', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 5000).toISOString(), NOW)).toBe('baru saja');
  });
});
