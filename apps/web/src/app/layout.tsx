import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
// MatterSemiMono — the brand display type (uploaded to src/fonts/ 2026-08-11),
// replacing the Space Grotesk stand-in used since the Colabs redesign. Served
// locally via next/font/local (no Google Fonts request). Weights 400/500/600/700
// cover every font-display heading on the site (semibold + bold dominate;
// 500 is cheap insurance for any medium-weight usage). The customer storefront
// layouts (/c, /store) declare their OWN --font-display (Bricolage) scoped to
// their subtree, so they are NOT affected — this stays marketing/legal/billing.
const matterSemiMono = localFont({
  src: [
    { path: '../fonts/MatterSemiMono-TRIAL-Regular.otf', weight: '400', style: 'normal' },
    { path: '../fonts/MatterSemiMono-TRIAL-Medium.otf', weight: '500', style: 'normal' },
    { path: '../fonts/MatterSemiMono-TRIAL-SemiBold.otf', weight: '600', style: 'normal' },
    { path: '../fonts/MatterSemiMono-TRIAL-Bold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
})

// Canonical origin for absolute social-share URLs (og:image must be
// absolute). Follows the NEXT_PUBLIC_SITE_URL convention from DEPLOY.md.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app'

const SITE_DESCRIPTION =
  'AI-powered fashion collections for Indian clothing stores. Catalog products in seconds with AI auto-tagging, share via WhatsApp, no website needed.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Plain title (no %s template): existing pages like /c/[slug] and /store/*
  // already append " | Kanchuki" manually — a template would double it.
  title: 'Kanchuki',
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Kanchuki',
    title: 'Kanchuki — AI-powered fashion collections for Indian clothing stores',
    description: SITE_DESCRIPTION,
    url: '/',
    locale: 'en_IN',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Kanchuki — AI-powered fashion collections for Indian clothing stores',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kanchuki — AI-powered fashion collections for Indian clothing stores',
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kanchuki',
  },
}

export const viewport: Viewport = {
  themeColor: '#14213D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Preconnect addresses for performance — parsed from env vars (server-side).
// The browser opens the TCP/TLS connection early, saving ~100ms on cold loads.
// Runtime API_URL first (non-NEXT_PUBLIC var — read at runtime, so it can
// override a stale build-inlined NEXT_PUBLIC value without a web rebuild),
// same precedence + truthiness as lib/apiUrl.ts (so API_URL="" falls through).
const API_ORIGIN = process.env['API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || ''
const R2_ORIGIN = process.env['NEXT_PUBLIC_R2_PUBLIC_URL'] ?? ''

const DEFAULT_PRIMARY_COLOR = '#14213D'

// Admin-configurable brand color (apps/web/src/app/admin/settings/theme) —
// read server-side on each request (60s revalidate) and injected as the
// --color-ink CSS var that tailwind.config.ts's `ink.600` and globals.css's
// raw-CSS spots both read. Falls back to the static default on any failure
// so a slow/down API never blocks page render.
async function getPrimaryColor(): Promise<string> {
  if (!API_ORIGIN) return DEFAULT_PRIMARY_COLOR
  try {
    const res = await fetch(`${API_ORIGIN}/v1/public/theme`, {
      next: { revalidate: 60 },
      // Hard 5s cap: this runs on EVERY server render of every page (incl. the
      // root `/` which is the Railway web healthcheck target). A down API was
      // hanging the request past the 30s healthcheck timeout → "Network
      // Healthcheck failure" on the Railway dashboard. The try/catch already
      // falls back to the default color — the missing piece was the timeout.
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return DEFAULT_PRIMARY_COLOR
    const json = (await res.json()) as { data?: { primary_color?: string } }
    return json.data?.primary_color ?? DEFAULT_PRIMARY_COLOR
  } catch {
    return DEFAULT_PRIMARY_COLOR
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const primaryColor = await getPrimaryColor()

  return (
    <html lang="en" className={`${inter.variable} ${matterSemiMono.variable}`}>
      <head>
        {/* API origin — collection data, enquiries, favorites */}
        {API_ORIGIN && (
          <>
            <link rel="preconnect" href={API_ORIGIN} />
            <link rel="dns-prefetch" href={API_ORIGIN} />
          </>
        )}
        {/* R2 CDN — product images,
            configured via NEXT_PUBLIC_R2_PUBLIC_URL env var */}
        {R2_ORIGIN && (
          <>
            <link rel="preconnect" href={R2_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={R2_ORIGIN} />
          </>
        )}
        <style>{`:root{--color-ink:${primaryColor}}`}</style>
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
