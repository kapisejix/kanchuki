import { fileURLToPath } from 'node:url'
import path from 'node:path'
import withSerwistInit from '@serwist/next'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // Cache product photos aggressively (photos rarely change once shot)
  cacheOnNavigation: true,
  reloadOnOnline: true,
  // Dev chunk filenames aren't content-hashed like prod, but defaultCache
  // still CacheFirsts _next/static — SW serves stale chunk bytes under the
  // same filename after every edit, causing ChunkLoadError. Prod-only.
  //
  // The SW stays disabled in `next dev` so hot reload never fights the cache.
  // The customer e2e suite (playwright.customer.config.ts) exercises the
  // offline rules in src/app/sw.ts against a production build (turbo build +
  // next start) instead — where the SW is always enabled and the precache
  // manifest contains the content-hashed prod chunks that a dev-mode offline
  // reload can't serve (hydration never runs on the raw SSR page).
  disable: process.env.NODE_ENV === 'development',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Railway deploys with Nixpacks which handles monorepo deps.
  // Standalone output disabled due to Next.js 14.2.x + pnpm monorepo
  // bug: "Cannot read properties of null (reading 'useContext')" during
  // file tracing. Railway's Nixpacks builder keeps full node_modules.

  // Transpile workspace packages — web only imports shared directly
  transpilePackages: ['@kanchuki/shared'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.cloudflare.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
        pathname: '/**',
      },
    ],
  },
  // Packages with no declared react peer dep (e.g. swiper) resolve a bare
  // `import 'react'` via Node's directory walk-up, which can land on the
  // react@19 hoisted at the workspace root (pulled in by a stray
  // @sentry/react-native dep there) instead of this app's react@18 —
  // pin the exact specifiers so the whole bundle shares one React instance.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    }
    return config
  },
  // PWA manifest & service worker served from /public
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default withSerwist(nextConfig)
