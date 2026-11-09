import { POST_DATE } from '@/app/(public)/[creatorSlug]/premium-cover';

const RELATIVE = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
const STEPS: [limitSeconds: number, unit: Intl.RelativeTimeFormatUnit, seconds: number][] = [
  [3600, 'minute', 60],
  [86_400, 'hour', 3600],
  [7 * 86_400, 'day', 86_400],
];

/** "baru saja", "5 menit yang lalu", "2 jam yang lalu", "3 hari yang lalu"; a week or older → the Asia/Jakarta date. */
export function formatRelativeTime(iso: string, now: Date): string {
  const seconds = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'baru saja';
  for (const [limit, unit, size] of STEPS) {
    if (seconds < limit) return RELATIVE.format(-Math.floor(seconds / size), unit);
  }
  return POST_DATE.format(new Date(iso));
}
