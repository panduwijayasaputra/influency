import { Plus_Jakarta_Sans } from 'next/font/google';

/** App-wide display/body face (self-hosted by next/font at build time). */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});
