const RUPIAH = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat('id-ID');
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
