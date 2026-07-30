import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, Serwist, StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'serwist'

// This declares the global `self.__SW_MANIFEST` variable (Serwist injects the
// precache manifest at build time, not at runtime). Without this declaration,
// TypeScript errors on self.__SW_MANIFEST.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[]
  }
}

declare const self: WorkerGlobalScope

const serwist = new Serwist({
  // '/offline' is precached at install time so it's available as a fallback
  // even if the customer never visited it while online.
  precacheEntries: [...(self.__SW_MANIFEST ?? []), '/offline'],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Product images from Cloudflare R2 — photos don't change once shot,
    // cache them forever (bounded) instead of hitting the network again.
    {
      matcher: ({ url }) =>
        url.hostname.endsWith('.r2.dev') ||
        url.hostname.endsWith('.r2.cloudflarestorage.com') ||
        url.hostname.endsWith('.cloudflare.com'),
      handler: new CacheFirst({
        cacheName: 'product-images',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    // Collection product-list API (same-origin, paginated client-side fetch)
    // — show the last-known list instantly, refresh in the background.
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/c/'),
      handler: new StaleWhileRevalidate({ cacheName: 'collection-api' }),
    },
    // Collection pages — try the network first (fresh data), fall back to
    // cache after 3s so a slow 2G connection doesn't hang the page.
    {
      matcher: ({ url }) => url.pathname.startsWith('/c/'),
      handler: new NetworkFirst({ cacheName: 'collection-pages', networkTimeoutSeconds: 3 }),
    },
    // Admin panel isn't part of the offline-capable customer PWA — defaultCache
    // below caches Next.js RSC/navigation fetches by URL only, so a cached
    // response from one nav method leaked into the other and admin pages
    // rendered blank until a hard refresh. Never cache admin at all.
    {
      matcher: ({ url }) => url.pathname.startsWith('/admin'),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
