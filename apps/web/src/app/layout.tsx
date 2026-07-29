import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['opsz', 'SOFT'],
})

export const metadata: Metadata = {
  title: 'Kanchuki',
  description: 'AI-powered fashion collections for Indian clothing stores',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kanchuki',
  },
}

export const viewport: Viewport = {
  themeColor: '#1E2A3D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Preconnect addresses for performance — parsed from env vars (server-side).
// The browser opens the TCP/TLS connection early, saving ~100ms on cold loads.
const API_ORIGIN = process.env['NEXT_PUBLIC_API_URL'] ?? process.env['API_URL'] ?? ''
const R2_ORIGIN = process.env['NEXT_PUBLIC_R2_PUBLIC_URL'] ?? ''

const DEFAULT_PRIMARY_COLOR = '#1E2A3D'

// Admin-configurable brand color (apps/web/src/app/admin/settings/theme) —
// read server-side on each request (60s revalidate) and injected as the
// --color-ink CSS var that tailwind.config.ts's `ink.600` and globals.css's
// raw-CSS spots both read. Falls back to the static default on any failure
// so a slow/down API never blocks page render.
async function getPrimaryColor(): Promise<string> {
  if (!API_ORIGIN) return DEFAULT_PRIMARY_COLOR
  try {
    const res = await fetch(`${API_ORIGIN}/v1/public/theme`, { next: { revalidate: 60 } })
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
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
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
