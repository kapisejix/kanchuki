import { fileURLToPath } from 'node:url'
import path from 'node:path'
import withSerwistInit from '@serwist/next'
import { withSentryConfig } from '@sentry/nextjs/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// CSP origins come from build-time env (NEXT_PUBLIC_* is inlined at build anyway).
const originOf = (u) => {
  try {
    return u ? new URL(u).origin : null
  } catch {
    return null
  }
}
const dev = process.env.NODE_ENV !== 'production'
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL)
const r2Origin = originOf(process.env.NEXT_PUBLIC_R2_PUBLIC_URL)
// Sentry DSN = https://<key>@<host>/<projectId>; its CSP report endpoint is derived from it.
let sentryOrigin = null
let cspReportUri = null
try {
  const dsn = new URL(process.env.NEXT_PUBLIC_SENTRY_DSN ?? '')
  sentryOrigin = dsn.origin
  cspReportUri = `${dsn.origin}/api${dsn.pathname}/security/?sentry_key=${dsn.username}`
} catch {}
const msg91 = ['https://*.msg91.com', 'https://*.phone91.com']
const r2 = ['https://*.r2.dev', 'https://*.r2.cloudflarestorage.com', r2Origin]
const directive = (name, ...values) => [name, ...values.flat().filter(Boolean)].join(' ')

// ponytail: 'unsafe-inline' scripts because App Router emits inline bootstrap
// scripts; nonces need middleware + dynamic rendering. Report-Only first, enforce
// once the Sentry reports are clean.
const csp = [
  directive('default-src', "'self'"),
  directive('script-src', "'self'", "'unsafe-inline'", dev && "'unsafe-eval'", msg91),
  directive('style-src', "'self'", "'unsafe-inline'", msg91),
  directive('img-src', "'self'", 'data:', 'blob:', r2, 'https://api.qrserver.com'),
  directive('media-src', "'self'", 'blob:', r2),
  directive('font-src', "'self'", 'data:'),
  directive('connect-src', "'self'", apiOrigin, sentryOrigin, r2, msg91, dev && 'ws:'),
  directive('frame-src', msg91),
  directive('worker-src', "'self'", 'blob:'),
  directive('object-src', "'none'"),
  directive('base-uri', "'self'"),
  directive('form-action', "'self'"),
  directive('frame-ancestors', "'none'"),
  cspReportUri && directive('report-uri', cspReportUri),
]
  .filter(Boolean)
  .join('; ')

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

  // Required for instrumentation.ts to run on Next 14.2 (default-on from 15).
  experimental: {
    instrumentationHook: true,
  },

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
  // PWA manifest & service worker served from /public
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ]
  },
}

// Sentry build integration: injects the client/server/edge configs and, when
// SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set at build time,
// uploads source maps. All optional — without them the build just skips upload.
export default withSentryConfig(withSerwist(nextConfig), {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Don't tunnel through the app: keep bundle lean; ad-blockers dropping a few
  // client events is an acceptable trade for pilot scale.
})

