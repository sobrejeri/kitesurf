/**
 * Next.js configuration for the Vento prototype.
 *
 * Vento (kitesurf lessons) is a navigable prototype: every screen renders
 * fictitious data and nothing is sent to an API. The security headers are set
 * anyway, so they are already in place when real data arrives.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), geolocation=()' },
          // A prototype with fictitious people in it has no business in a search index.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
