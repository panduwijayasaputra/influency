// shortcut: placeholder legal copy until legal delivers final text ([TBD]); replace the arrays and LEGAL_UPDATED_AT then.
// Every body stays in brackets and states no business values (prices, durations): those are [TBD].

export const LEGAL_UPDATED_AT = '[TANGGAL]';

export type LegalDoc = {
  title: string;
  sections: readonly (readonly [heading: string, body: string])[];
};

export const TERMS: LegalDoc = {
  title: 'Syarat',
  sections: [
    [
      'Akun kamu',
      '[Kamu masuk dengan Telegram. Syarat usia, kelayakan dan tanggung jawab akun dari legal.]',
    ],
    ['Koin dan pembayaran', '[Ketentuan top-up, nilai Koin, refund dan masa berlaku dari legal.]'],
    ['Konten premium dan langganan', '[Ketentuan akses post dan langganan dari legal.]'],
    ['Creator', '[Tanggung jawab creator, biaya dan aturan pencairan dari legal.]'],
    ['Aturan konten', '[Konten terlarang, pelaporan dan moderasi dari legal.]'],
    [
      'Penangguhan dan penutupan akun',
      '[Kapan akun dapat ditangguhkan atau ditutup, dan dampaknya pada Koin dan akses, dari legal.]',
    ],
    ['Kontak', '[Nama perusahaan, alamat dan kontak dukungan.]'],
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Kebijakan Privasi',
  sections: [
    [
      'Data yang kami kumpulkan',
      '[Dari Telegram: ID, nama, username dan foto profil. Di aplikasi: creator yang diikuti, post yang disimpan dan dibeli, komentar dan transaksi Koin. Daftar lengkap dari legal.]',
    ],
    ['Cara kami menggunakannya', '[Tujuan dan dasar hukum dari legal.]'],
    ['Pembayaran dan pencairan', '[Penyedia pembayaran dan data yang mereka terima.]'],
    [
      'Berbagi data',
      '[Pihak penerima data, misalnya mitra pembayaran dan otoritas bila diwajibkan hukum.]',
    ],
    ['Penyimpanan', '[Berapa lama data disimpan, termasuk komentar dan catatan transaksi.]'],
    [
      'Pilihan dan hakmu',
      '[Cara mengakses, mengoreksi, mengekspor atau menghapus data sesuai hukum Indonesia.]',
    ],
    ['Kontak', '[Kontak perlindungan data.]'],
  ],
};
