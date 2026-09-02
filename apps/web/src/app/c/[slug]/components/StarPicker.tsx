'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { ConsentCheckbox } from '@/components/ConsentCheckbox'

interface StarPickerProps {
  value: number
  onChange: (rating: number) => void
  size?: number
  disabled?: boolean
}

export function StarPicker({ value, onChange, size = 28, disabled = false }: StarPickerProps) {
  const [hovered, setHovered] = useState(0)

  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isActive = star <= (hovered || value)
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            disabled={disabled}
            className={`transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 rounded ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:scale-90'
            }`}
            onMouseEnter={() => !disabled && setHovered(star)}
            onMouseLeave={() => !disabled && setHovered(0)}
            onClick={() => !disabled && onChange(star)}
          >
            <Star
              size={size}
              className={`transition-colors duration-150 ${
                isActive ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Excellent',
}

// Canned review lines the customer can drop into the comment box, then edit.
// {store} / {product} are filled from the retailer + product names.
export const COMMENT_TEMPLATES = [
  'Loved my {product} from {store}! Great quality and fit.',
  'Very happy with {product}. {store} service was excellent.',
  '{product} is beautiful. Delivery from {store} was quick.',
  'Good experience shopping at {store}. {product} matches the photos.',
  '{store} helped me pick the right size. {product} fits perfectly.',
  'Recommend {store}. My {product} is exactly what I wanted.',
]

export function fillTemplate(
  tpl: string,
  vars: { store: string; product: string },
): string {
  return tpl.replace(/\{store\}/g, vars.store).replace(/\{product\}/g, vars.product)
}

interface ReviewFormProps {
  productName: string
  retailerId: string
  productId: string
  retailerName: string
  onSubmit?: () => void
}

export function ReviewForm({
  productName,
  retailerId,
  productId,
  retailerName,
  onSubmit,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  // Prefill name/phone from ContactGate localStorage if available
  const [name, setName] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      // Extract store slug from the current URL path: /{store}/{slug}/... or /c/{slug}/...
      const parts = window.location.pathname.split('/').filter(Boolean)
      const slug = parts[0] === 'c' ? parts[1] : parts[0]
      return slug ? localStorage.getItem(`kanchuki_lead_name_${slug}`) ?? '' : ''
    } catch { return '' }
  })
  const [phone, setPhone] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      const parts = window.location.pathname.split('/').filter(Boolean)
      const slug = parts[0] === 'c' ? parts[1] : parts[0]
      return slug ? localStorage.getItem(`kanchuki_lead_phone_${slug}`) ?? '' : ''
    } catch { return '' }
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [routing, setRouting] = useState<{
    action: string
    message?: string
    url?: string
  } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0 || !phone || !consent) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/reviews/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          phone,
          name: name || undefined,
          rating,
          comment: comment || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // API errors come back either as { error: { message } } (errorHandler)
        // or { error: "<string>" } (eligibility 403) — handle both.
        const msg = typeof data.error === 'string' ? data.error : data.error?.message
        throw new Error(msg || 'Failed to submit review')
      }

      const data = await res.json()
      setRouting(data.routing)
      setSubmitted(true)
      onSubmit?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
          <Star size={24} className="text-amber-400 fill-amber-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Thanks for your review!</h3>
        <p className="text-sm text-gray-500 mb-1">
          You rated <span className="font-medium text-gray-700">{productName}</span>{' '}
          {rating} star{rating > 1 ? 's' : ''}
        </p>

        {routing?.action === 'google_review' && routing.url && (
          <a
            href={routing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            ⭐ {routing.message}
          </a>
        )}
        {routing?.action === 'private_feedback' && (
          <p className="mt-3 text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            {routing.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Rate this product
        </h3>
        <p className="text-xs text-gray-500">
          How did you like {productName}?
        </p>
      </div>

      {/* Star picker */}
      <div className="flex items-center gap-3">
        <StarPicker value={rating} onChange={setRating} size={32} />
        {rating > 0 && (
          <span className="text-sm font-medium text-amber-600">
            {RATING_LABELS[rating]}
          </span>
        )}
      </div>

      {/* Comment templates — tap to prefill, still editable */}
      <div>
        <p className="block text-xs font-medium text-gray-500 mb-1.5">
          Quick templates
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COMMENT_TEMPLATES.map((tpl) => {
            const filled = fillTemplate(tpl, { store: retailerName, product: productName })
            return (
              <button
                key={tpl}
                type="button"
                onClick={() => setComment(filled)}
                className="text-left text-[11px] leading-snug text-gray-600 bg-gray-50 hover:bg-cyan-50 hover:text-cyan-800
                           border border-gray-200 hover:border-cyan-300 rounded-lg px-2.5 py-1.5 transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {filled}
              </button>
            )
          })}
        </div>
      </div>

      {/* Comment */}
      <div>
        <label htmlFor="review-comment" className="block text-xs font-medium text-gray-500 mb-1">
          Review (optional)
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What did you like or dislike?"
          rows={3}
          maxLength={1000}
          className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 resize-none
                     placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent
                     transition-shadow"
        />
        <p className="text-[10px] text-gray-400 mt-1 text-right">{comment.length}/1000</p>
      </div>

      {/* Name + Phone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="review-name" className="block text-xs font-medium text-gray-500 mb-1">
            Name (optional)
          </label>
          <input
            id="review-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={200}
            className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent
                       transition-shadow"
          />
        </div>
        <div>
          <label htmlFor="review-phone" className="block text-xs font-medium text-gray-500 mb-1">
            Phone *
          </label>
          <input
            id="review-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile"
            required
            className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent
                       transition-shadow"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <ConsentCheckbox checked={consent} onChange={setConsent} />

      {/* Submit */}
      <button
        type="submit"
        disabled={rating === 0 || !phone || !consent || loading}
        className={`w-full font-semibold py-3 rounded-xl text-sm transition-all active:scale-[0.98]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2
          ${rating > 0 && phone && consent
            ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-soft'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
      >
        {loading ? 'Submitting...' : 'Submit Review'}
      </button>
    </form>
  )
}
