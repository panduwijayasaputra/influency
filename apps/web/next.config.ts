import type { NextConfig } from 'next';
import { API_PREFIX } from '@influency/shared';
import { API_ORIGIN } from './src/lib/api/origin';

// The browser talks to the web origin, which proxies the API (first-party cookies, no CORS).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  partialPrefetching: true,
  rewrites: () => [
    { source: `/${API_PREFIX}/:path*`, destination: `${API_ORIGIN}/${API_PREFIX}/:path*` },
  ],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
