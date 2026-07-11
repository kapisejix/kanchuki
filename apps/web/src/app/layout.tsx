import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

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
  themeColor: '#0891B2',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Preconnect addresses for performance — parsed from env vars (server-side).
// The browser opens the TCP/TLS connection early, saving ~100ms on cold loads.
const API_ORIGIN = process.env['NEXT_PUBLIC_API_URL'] ?? process.env['API_URL'] ?? ''
const R2_ORIGIN = process.env['NEXT_PUBLIC_R2_PUBLIC_URL'] ?? ''

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
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
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
