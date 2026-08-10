import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';

// This declares the global `self.__SW_MANIFEST` variable (Serwist injects the
// precache manifest at build time, not at runtime). Without this declaration,
// TypeScript errors on self.__SW_MANIFEST.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}

declare const self: WorkerGlobalScope;

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
    // Covers the legacy /api/c/{slug}/... proxies and the canonical
    // /api/{store}/{collection}/... + /api/{store}/categories/{categoryId}/...
    // + /api/{store}/products (All Products tile) proxies (dynamic first
    // segment — regex, not startsWith).
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/api/c/') ||
        /^\/api\/[^/]+\/[^/]+\/(products|favorite|checkout-status)$/.test(url.pathname) ||
        /^\/api\/[^/]+\/categories\/[^/]+\/products$/.test(url.pathname) ||
        /^\/api\/[^/]+\/products$/.test(url.pathname),
      handler: new StaleWhileRevalidate({ cacheName: 'collection-api' }),
    },
    // Legacy collection pages (/c/[slug]) — redirect pages now, kept for
    // links shared before the canonical /{store}/{collection} scheme.
    {
      matcher: ({ url }) => url.pathname.startsWith('/c/'),
      handler: new NetworkFirst({ cacheName: 'collection-pages', networkTimeoutSeconds: 3 }),
    },
    // Legacy store pages (/store/[slug]...) — redirect pages now (QR codes
    // printed before the canonical /{store} scheme).
    {
      matcher: ({ url }) => url.pathname.startsWith('/store/'),
      handler: new NetworkFirst({ cacheName: 'store-pages', networkTimeoutSeconds: 3 }),
    },
    // Canonical storefront pages — same bug class as the legacy /store/
    // rule: defaultCache caches RSC prefetch/nav payloads by URL only, so a
    // stale payload got served on click and the page hung until a hard
    // reload bypassed the SW cache. Covers the store profile
    // (/{public_slug}), collections (/{public_slug}/{slug}), the categories
    // browse + product pages (/{public_slug}/categories[/{categoryId}]) and
    // the cart/wishlist/checkout/order sub-flows
    // (/{public_slug}/{slug}/{cart|wishlist|checkout|order/{id}}) — 1 to 4
    // segments. Static assets (/admin, /api, /_next) are excluded below so
    // immutable chunks keep their CacheFirst treatment from defaultCache.
    {
      matcher: ({ url }) => {
        if (
          url.pathname.startsWith('/api/') ||
          url.pathname.startsWith('/admin') ||
          url.pathname.startsWith('/_next/')
        )
          return false;
        const segments = url.pathname.split('/').filter(Boolean);
        return segments.length >= 1 && segments.length <= 4;
      },
      handler: new NetworkFirst({ cacheName: 'store-pages', networkTimeoutSeconds: 3 }),
    },
    // Admin panel isn't part of the offline-capable customer PWA — defaultCache
    // below caches Next.js RSC/navigation fetches by URL only, so a cached
    // response from one nav method leaked into the other and admin pages
    // rendered blank until a hard refresh. Never cache admin at all.
    {
      matcher: ({ url }) => url.pathname.startsWith('/admin'),
      handler: new NetworkOnly(),
    },
    // Admin API calls go to a separate origin (the API service), so the
    // pathname there is /v1/admin/... not /admin/... — the rule above never
    // matches them and they fell into defaultCache, which cached a stale
    // 403 (e.g. from a since-expired session) and replayed it forever on
    // every retry/re-login. Host-agnostic pathname match catches it
    // regardless of which origin NEXT_PUBLIC_API_URL points at.
    {
      matcher: ({ url }) => url.pathname.startsWith('/v1/admin'),
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
});

serwist.addEventListeners();
