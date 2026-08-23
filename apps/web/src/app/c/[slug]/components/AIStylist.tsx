'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Sparkles, Send, Loader2, X, MessageCircle } from 'lucide-react'
import { formatPriceRange } from '@kanchuki/shared'

interface Recommendation {
  product_id: string
  name: string
  category: string | null
  color: string | null
  price: number | null
  photo_url: string | null
  rationale: string
}

interface StylistResponse {
  recommendations: Recommendation[]
  stylist_note: string
}

interface Props {
  storeSlug: string
  storeName: string
  onProductTap?: (productId: string) => void
}

const SUGGESTIONS = [
  'Cotton saree for daily wear under ₹2000',
  'Wedding lehenga in red and gold',
  'Pastel kurta set for a mehendi',
  'Silk suit for a pooja ceremony',
  'Casual kurti for office',
]

export function AIStylist({ storeSlug, storeName, onProductTap }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<StylistResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const handleSubmit = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const res = await fetch('/api/stylist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: storeSlug, query: q.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message ?? 'Stylist unavailable')
      }

      const json = await res.json() as { data: StylistResponse }
      setResults(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [storeSlug])

  // Push a history entry when the overlay opens so the phone/browser Back
  // button closes the modal instead of exiting the entire store page.
  // Mirrors the pattern already used by ProductDetailSheet.
  const openOverlay = useCallback(() => {
    setOpen(true)
    window.history.pushState({ kanchukiAiStylist: true }, '')
  }, [])

  const closeOverlay = useCallback(() => {
    setOpen(false)
    window.history.back()
  }, [])

  useEffect(() => {
    if (!open) return
    let poppedByUser = false
    const handlePopState = () => {
      poppedByUser = true
      setOpen(false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      // If the component unmounts without a popstate (e.g. parent re-renders),
      // clean up the history entry we pushed.
      if (!poppedByUser) window.history.back()
    }
  }, [open])

  // Floating button
  if (!open) {
    return (
      <button
        onClick={openOverlay}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 bg-gradient-to-br from-cyan-500 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all active:scale-90 hover:-translate-y-0.5"
        aria-label="Open AI Stylist"
      >
        <Sparkles size={22} />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={closeOverlay}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative mt-auto bg-white rounded-t-3xl max-h-[85vh] flex flex-col w-full max-w-md mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-full flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">AI Stylist</p>
              <p className="text-[10px] text-gray-400">{storeName}</p>
            </div>
          </div>
          <button
            onClick={closeOverlay}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <X size={14} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!results && !loading && !error && (
            <>
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <MessageCircle size={20} className="text-cyan-500" />
                </div>
                <p className="text-sm font-semibold text-gray-900">What are you looking for?</p>
                <p className="text-xs text-gray-500 mt-1">
                  Tell me the occasion, color, budget, or style — I&apos;ll find the perfect match from {storeName}&apos;s collection.
                </p>
              </div>
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void handleSubmit(s)}
                    className="w-full text-left bg-gray-50 hover:bg-cyan-50 border border-gray-100 hover:border-cyan-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 transition-colors"
                  >
                    💡 {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {loading && (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={24} className="animate-spin text-cyan-500 mb-3" />
              <p className="text-sm text-gray-600">Finding outfits for you...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => { setError(null); setResults(null) }}
                className="text-xs text-red-500 underline mt-1"
              >
                Try again
              </button>
            </div>
          )}

          {results && (
            <>
              {results.stylist_note && (
                <p className="text-[10px] text-gray-400 text-center italic">{results.stylist_note}</p>
              )}
              {results.recommendations.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500">No matching items found. Try a different query!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {results.recommendations.map((rec) => (
                    <button
                      key={rec.product_id}
                      onClick={() => onProductTap?.(rec.product_id)}
                      className="w-full flex gap-3 bg-white border border-gray-100 rounded-2xl p-3 hover:border-cyan-200 hover:shadow-sm transition-all text-left"
                    >
                      <div className="w-20 h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                        {rec.photo_url ? (
                          <Image
                            src={rec.photo_url}
                            alt={rec.name}
                            width={80}
                            height={96}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">✨</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{rec.name}</p>
                        <p className="text-xs text-gray-500">{rec.category}{rec.color ? ` · ${rec.color}` : ''}</p>
                        {rec.price != null && (
                          <p className="text-xs font-bold text-cyan-700 mt-1">
                            ₹{rec.price.toLocaleString('en-IN')}
                          </p>
                        )}
                        <p className="text-[10px] text-cyan-600 mt-1 leading-relaxed italic">
                          ✨ {rec.rationale}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setResults(null); setQuery('') }}
                className="w-full text-center text-xs text-cyan-600 hover:text-cyan-700 font-medium py-2"
              >
                Ask for something else
              </button>
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  void handleSubmit(query)
                  setQuery('')
                }
              }}
              placeholder="e.g. Pink silk suit for a wedding"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-400"
              disabled={loading}
            />
            <button
              onClick={() => { void handleSubmit(query); setQuery('') }}
              disabled={!query.trim() || loading}
              className="bg-cyan-600 disabled:bg-gray-200 text-white w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
