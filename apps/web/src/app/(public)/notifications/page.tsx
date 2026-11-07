import { ComingSoon } from '@/components/coming-soon';

export const metadata = { title: 'Notifikasi' };

export default function Page() {
  return (
    <ComingSoon
      title="Notifikasi"
      description="Kabar terbaru dari creator yang kamu ikuti dan aktivitas akunmu akan muncul di sini."
    />
  );
}
