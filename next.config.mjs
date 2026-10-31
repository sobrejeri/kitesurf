/**
 * Next.js configuration for Vento.
 *
 * Security headers are set on every response. A build id is baked into the
 * client bundle (NEXT_PUBLIC_BUILD_ID) and written to a static
 * public/version.json during the production build, from one shared value, so
 * an open page can compare its own id with the live server's and offer to
 * update. The two always match within a build and change together each deploy.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The instructor accepts avatars of up to 3 MiB. The default Server
  // Action request limit is just 1 MiB and rejects camera photos before our
  // upload action can validate them. Leave room for multipart overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), geolocation=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      // Always fetch the live version marker, never a cached copy.
      { source: '/version.json', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    ];
  },
};

export default function config(phase) {
  // Render's commit SHA, else a build timestamp; 'dev' outside a build.
  const id = process.env.RENDER_GIT_COMMIT ?? (phase === 'phase-production-build' ? String(Date.now()) : 'dev');
  if (phase === 'phase-production-build') {
    try {
      mkdirSync('public', { recursive: true });
      writeFileSync('public/version.json', JSON.stringify({ id }));
    } catch {
      // A read-only build dir just means the update prompt stays off.
    }
  }
  return { ...nextConfig, env: { NEXT_PUBLIC_BUILD_ID: id } };
}
