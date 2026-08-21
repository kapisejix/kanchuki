'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tag, Clock, X, Copy, Check } from 'lucide-react'

interface Promotion {
  id: string
  code: string
  discount_type: 'PERCENT' | 'FIXED'
  discount_value: number
  min_order_paise: number | null
  ends_at: string | null
}

interface Props {
  storeSlug: string
}

export function PromotionBanner({ storeSlug }: Props) {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${storeSlug}/promotions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data: Promotion[] } | null) => {
        if (!cancelled && json?.data) setPromotions(json.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [storeSlug])

  const handleCopy = useCallback(async (code: string, id: string) => {
    await navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  if (loading || promotions.length === 0 || dismissed) return null

  const fmtDiscount = (p: Promotion) =>
    p.discount_type === 'PERCENT' ? `${p.discount_value}% off` : `₹${(p.discount_value / 100).toFixed(0)} off`

  const fmtTimeLeft = (endsAt: string | null) => {
    if (!endsAt) return null
    const diff = new Date(endsAt).getTime() - Date.now()
    if (diff <= 0) return null
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 24) return `${hours}h left`
    const days = Math.floor(hours / 24)
    return `${days}d left`
  }

  // Show the first active promotion as a banner
  const promo = promotions[0]!
  const timeLeft = fmtTimeLeft(promo.ends_at)

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Tag size={16} className="text-amber-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900">
              {fmtDiscount(promo)}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Use code{' '}
              <button
                onClick={() => void handleCopy(promo.code, promo.id)}
                className="font-mono font-bold bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded transition-colors inline-flex items-center gap-1"
              >
                {promo.code}
                {copiedId === promo.id ? (
                  <Check size={10} className="text-green-600" />
                ) : (
                  <Copy size={10} className="text-amber-500" />
                )}
              </button>
              {promo.min_order_paise && (
                <span className="text-amber-600 ml-1">
                  (min ₹{(promo.min_order_paise / 100).toFixed(0)})
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {timeLeft && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
              <Clock size={9} />
              {timeLeft}
            </span>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="w-6 h-6 rounded-full hover:bg-amber-100 flex items-center justify-center transition-colors"
            aria-label="Dismiss"
          >
            <X size={12} className="text-amber-400" />
          </button>
        </div>
      </div>
      {promotions.length > 1 && (
        <p className="text-[10px] text-amber-600 mt-1.5 ml-6">
          +{promotions.length - 1} more offer{promotions.length > 2 ? 's' : ''} available
        </p>
      )}
    </div>
  )
}
