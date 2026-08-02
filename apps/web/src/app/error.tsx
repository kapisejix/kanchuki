'use client'

import { useEffect } from 'react'

// Root error boundary (App Router). Any uncaught client-side exception in a
// route segment lands here — WITHOUT this file, Next.js shows the bare
// "Application error: a client-side exception has occurred" page with no
// retry affordance. The retry button calls reset(), which re-renders the
// failed segment. Keep this dependency-free and SSR-safe (client-only).
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the real error to the console — the default page's "(see the
    // browser console for more information)" is useless without it.
    console.error('[web:error]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 bg-cotton">
      <div className="max-w-md w-full bg-white rounded-2xl border border-sand-200 p-8 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-ink-600 flex items-center justify-center">
          <span className="text-white font-bold text-lg">K</span>
        </div>
        <h1 className="text-lg font-semibold text-charcoal mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-sand-500 mb-1">
          {error.message || 'An unexpected error occurred on this page.'}
        </p>
        {error.digest && (
          <p className="text-xs text-sand-400 font-mono mb-4">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-ink-600 hover:bg-ink-700 text-white text-sm font-semibold rounded-full transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
