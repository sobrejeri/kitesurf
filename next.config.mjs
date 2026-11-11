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
  // Instructor documents allow up to 8 MiB and photos up to 3 MiB.
  // Reserve 1 MiB for multipart overhead; server actions validate each file.
  experimental: {
    serverActions: {
      bodySizeLimit: '9mb',
    },
  },
  // The Pousada app became the Afiliado app. Old links, bookmarks and
  // installed shortcuts keep working; temporary (307) so the move stays
  // reversible without browsers caching it forever.
  async redirects() {
    return [
      { source: '/pousada', destination: '/afiliado/inicio', permanent: false },
      { source: '/pousada/:path*', destination: '/afiliado/:path*', permanent: false },
    ];
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
