'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 text-red-600 mb-3">
          <AlertTriangle size={20} />
          <h1 className="text-lg font-semibold">Admin page crashed</h1>
        </div>
        <p className="text-sm text-gray-600 mb-1">{error.message || 'Unknown error'}</p>
        {error.digest && <p className="text-xs text-gray-400 mb-3">Digest: {error.digest}</p>}
        {error.stack && (
          <pre className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 overflow-auto max-h-64 mb-4 whitespace-pre-wrap">
            {error.stack}
          </pre>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
