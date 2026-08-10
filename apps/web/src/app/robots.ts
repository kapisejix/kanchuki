import type { MetadataRoute } from 'next'

// /robots.txt — generated from the App Router file convention.
// Marketing, store (/{public_slug}) and collection (/{public_slug}/{slug})
// pages are indexable; the admin panel and API are explicitly excluded.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/offline'],
      },
    ],
    host: SITE_URL,
  }
}
