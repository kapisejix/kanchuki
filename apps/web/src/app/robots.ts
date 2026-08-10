import type { MetadataRoute } from 'next';

// /robots.txt — generated from the App Router file convention.
// Marketing, store (/{public_slug}) and collection (/{public_slug}/{slug})
// pages are indexable; the admin panel and API are explicitly excluded.
// The sitemap (app/sitemap.ts) enumerates every live store's storefront
// URLs — Google's indexer is pointed there so new stores/categories get
// crawled without relying on link discovery.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/offline'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
