import type { NextConfig } from 'next';

const PROD_API_HOSTS: string[] = [
  // Add deployed backend hostnames here. Pulled in at build time so the
  // browser bundle only allows CORS / image fetches to known origins.
  // Example: 'api.myc-ops.com'
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Production-only hardening. The frontend talks to the backend over HTTPS,
  // so we tell Next it's safe to upgrade any stray http:// image/asset refs.
  ...(process.env.NODE_ENV === 'production' && PROD_API_HOSTS.length
    ? {
        images: {
          remotePatterns: PROD_API_HOSTS.map((hostname) => ({
            protocol: 'https',
            hostname,
            pathname: '/uploads/**',
          })),
        },
      }
    : {}),
};

export default nextConfig;
