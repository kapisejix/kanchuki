'use client'

import { useState, useCallback } from 'react'
import { Bell, BellOff, Check, Loader2 } from 'lucide-react'

interface Props {
  productId: string
  storeSlug: string
  productName: string
}

export function NotifyWhenAvailable({ productId, storeSlug, productName }: Props) {
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (phone.trim().length < 10) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/${storeSlug}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Customer',
          phone: phone.trim(),
          gender: 'FEMALE',
          consent: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message ?? 'Failed to register interest')
      }

      // Store locally so we don't ask again
      try {
        const key = `kanchuki_notify_${productId}`
        localStorage.setItem(key, '1')
      } catch {}
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [phone, productId, storeSlug])

  // Already submitted or stored locally
  if (submitted) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
        <Check size={16} className="text-green-600 flex-shrink-0" />
        <p className="text-xs text-green-700 font-medium">
          We&apos;ll let you know when {productName} is back!
        </p>
      </div>
    )
  }

  // Check localStorage
  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem(`kanchuki_notify_${productId}`)) {
        return (
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
            <BellOff size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-xs text-green-700 font-medium">
              You&apos;re already on the notify list!
            </p>
          </div>
        )
      }
    } catch {}
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-semibold py-2.5 rounded-xl transition-colors"
      >
        <Bell size={14} />
        Notify When Available
      </button>
    )
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-800">
        Get notified when {productName} is back in stock
      </p>
      <div className="flex gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your phone number"
          className="flex-1 text-sm border border-amber-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-amber-400"
          minLength={10}
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={phone.trim().length < 10 || loading}
          className="bg-amber-600 disabled:bg-amber-300 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
          Notify
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-red-500">{error}</p>
      )}
    </div>
  )
}
