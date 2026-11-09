const RUPIAH = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat('id-ID');
const COMPACT = new Intl.NumberFormat('id-ID', { notation: 'compact' });

/** 12400 → "12,4 rb". */
export const formatCompactNumber = (n: number): string => COMPACT.format(n);
/** 12400 → "12.400". */
export const formatNumber = (n: number): string => NUMBER.format(n);
const DATE = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

/** 25000 → "Rp25.000". */
export const formatRupiah = (n: number): string => `Rp${RUPIAH.format(n)}`;
/** 1250 → "1.250 Koin". */
export const formatKoin = (n: number): string => `${NUMBER.format(n)} Koin`;
/** ISO instant → "3 Nov 2026" in Asia/Jakarta. */
export const formatJakartaDate = (iso: string): string => DATE.format(new Date(iso));
/** Whole days left until `endsAtIso`, rounded up (1 ms left → 1), never negative. */
export const daysLeft = (endsAtIso: string, now: Date): number =>
  Math.max(0, Math.ceil((new Date(endsAtIso).getTime() - now.getTime()) / 86_400_000));
/** Badge on a Langganan card: `daysLeft` is a server-side ceiling, so 1 means it ends within 24 hours. */
export const daysLeftLabel = (days: number): string =>
  days <= 1 ? 'Aktif · berakhir hari ini' : `Aktif · ${days} hari lagi`;
