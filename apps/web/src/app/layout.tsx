import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { APP_NAME } from '@influency/shared';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Konten eksklusif dari creator favoritmu.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
