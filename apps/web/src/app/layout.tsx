import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { APP_NAME } from '@influency/shared';
import { SiteHeader } from '@/components/site-header';
import { Toaster } from '@/components/ui/toast';
import { jakarta } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Konten eksklusif dari creator favoritmu.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // makes env(safe-area-inset-*) non-zero on notched devices
  interactiveWidget: 'resizes-content', // Android: keyboard shrinks dvh so sheets stay above it; iOS: useKeyboardInset
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} font-sans antialiased`}>
      <body className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <Toaster>
          <SiteHeader />
          {children}
        </Toaster>
      </body>
    </html>
  );
}
