import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
        ],
      },
    ]
  },
}

export default nextConfig
