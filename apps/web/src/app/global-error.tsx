'use client'

import { useEffect } from 'react'

// Global error boundary — the LAST line of defense in the App Router. It
// replaces the default "Application error: a client-side exception has
// occurred" screen (which has no retry and tells users to open devtools).
// Unlike error.tsx, this one renders OUTSIDE the root layout (html/body
// included), so it must define its own <html> and <body>. Reset here means
// a full page reload: the failed segment is above the nearest boundary.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[web:global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#FBFAF8', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #E8E2D8',
              padding: 32,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                margin: '0 auto 16px',
                borderRadius: 12,
                background: '#1E2A3D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>K</span>
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: '#0C121C' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: '#7B8CA0', margin: '0 0 8px' }}>
              {error.message || 'An unexpected error occurred.'}
            </p>
            {error.digest && (
              <p style={{ fontSize: 12, color: '#A4B2C0', fontFamily: 'monospace', margin: '0 0 16px' }}>
                Digest: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                padding: '10px 20px',
                background: '#1E2A3D',
                color: '#fff',
                border: 'none',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
