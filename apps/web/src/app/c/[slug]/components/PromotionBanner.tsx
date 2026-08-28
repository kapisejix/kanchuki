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
    <div className="bg-gradient-to-r from-[#FAF9FE] via-white to-[#F2F1FA] border border-[#E0E1F6] rounded-[22px] p-3.5 shadow-sm mb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#BB3F95]/15 flex items-center justify-center text-[#BB3F95] flex-shrink-0">
            <Tag size={16} className="text-[#BB3F95]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-[#231F48] uppercase tracking-wide">
                {fmtDiscount(promo)}
              </span>
              <span className="text-[10px] text-[#6B4773] font-medium">Use code</span>
              <button
                onClick={() => void handleCopy(promo.code, promo.id)}
                className="font-mono font-bold text-[10px] bg-[#231F48] text-white hover:bg-[#560A39] px-2 py-0.5 rounded-md transition-colors inline-flex items-center gap-1 shadow-sm"
              >
                {promo.code}
                {copiedId === promo.id ? (
                  <Check size={11} className="text-emerald-300" />
                ) : (
                  <Copy size={11} className="text-[#E0E1F6]" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-[#6B4773] font-medium mt-0.5">
              {promo.min_order_paise
                ? `On minimum cart order of ₹${(promo.min_order_paise / 100).toFixed(0)}`
                : 'Valid on entire collection'}
              {timeLeft && ` · ${timeLeft}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-[#928EB2] hover:text-[#231F48] p-1 text-xs"
          aria-label="Dismiss promotion"
        >
          <X size={14} />
        </button>
      </div>
      {promotions.length > 1 && (
        <p className="text-[10px] text-[#6B4773]/70 mt-2 ml-[52px]">
          +{promotions.length - 1} more offer{promotions.length > 2 ? 's' : ''} available
        </p>
      )}
    </div>
  )
}
