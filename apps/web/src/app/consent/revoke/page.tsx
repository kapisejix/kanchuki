'use client'

import { useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Shield, Check, X, Loader2, AlertTriangle } from 'lucide-react'

type Step = 'confirm' | 'submitting' | 'done' | 'error'

export default function RevokeConsentPage() {
  const searchParams = useSearchParams()
  const initialToken = searchParams.get('token') ?? ''

  const [token, setToken] = useState(initialToken)
  const [step, setStep] = useState<Step>(initialToken ? 'confirm' : 'confirm')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleRevoke = useCallback(async () => {
    if (!token.trim()) {
      setErrorMessage('Please enter your revocation token.')
      return
    }

    setStep('submitting')
    setErrorMessage(null)

    try {
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/v1/consent/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: { message: 'Revocation failed' } }))
        throw new Error(errData.error?.message ?? 'Invalid or expired revocation token')
      }

      setStep('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
      setStep('error')
    }
  }, [token])

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Shield size={28} className="text-cyan-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Data Consent Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Revoke training-data consent for Kanchuki Virtual Try-On
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          {step === 'confirm' && (
            <>
              {/* Token input */}
              <div className="mb-5">
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Revocation Token
                </label>
                <input
                  id="token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your revocation token here..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm
                             focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent
                             placeholder:text-gray-300"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  This token was shown on your try-on result screen after you opted in for
                  training-data collection.
                </p>
              </div>

              {/* Info box */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 leading-5">
                    This will permanently delete your retained try-on photos from our
                    training dataset. This action cannot be undone. Your original
                    try-on result (on the shop&apos;s collection page) is not affected.
                  </p>
                </div>
              </div>

              {/* Submit button */}
              <button
                onClick={() => void handleRevoke()}
                disabled={!token.trim()}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400
                           text-white font-semibold py-3.5 rounded-2xl transition-colors flex items-center
                           justify-center gap-2"
              >
                <X size={18} />
                Revoke Consent & Delete Data
              </button>

              {errorMessage && (
                <p className="text-xs text-red-500 text-center mt-3">{errorMessage}</p>
              )}
            </>
          )}

          {/* Submitting */}
          {step === 'submitting' && (
            <div className="text-center py-6">
              <Loader2 size={32} className="animate-spin text-cyan-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">Processing your request...</p>
              <p className="text-xs text-gray-400 mt-1">Deleting retained training photos</p>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Consent Revoked</h2>
              <p className="text-sm text-gray-500 mt-1 leading-5">
                Your training-data consent has been withdrawn and all retained photos
                have been permanently deleted from our training dataset.
              </p>
              <div className="mt-6 bg-cyan-50 border border-cyan-100 rounded-xl p-3">
                <p className="text-xs text-cyan-700 leading-5">
                  Your original try-on preview on the shop&apos;s collection page is not affected.
                  It will expire as normal within 24 hours.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={28} className="text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Something went wrong</h2>
              <p className="text-sm text-gray-500 mt-1">{errorMessage}</p>
              <button
                onClick={() => setStep('confirm')}
                className="mt-5 w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold
                           py-3 rounded-2xl transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center mt-6">
          Kanchuki — AI Fashion Commerce Platform. Questions? Contact the retailer who sent
          you your try-on link.
        </p>
      </div>
    </div>
  )
}
