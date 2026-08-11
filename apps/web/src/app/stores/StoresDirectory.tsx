'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin, Search, Store, X } from 'lucide-react'
import Link from 'next/link'
import StoreLogo from '@/components/site/StoreLogo'
import { SelvedgeCard } from '@/components/site/Chrome'
import type { StoresDirectoryData } from './page'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const PAGE_SIZE = 12

export default function StoresDirectory({ initial }: { initial: StoresDirectoryData | null }) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [city, setCity] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  // `data` starts as the SSR payload; a failed fetch distinguishes an API
  // outage from a genuinely empty directory (honesty gate — never claim "be
  // the first store" while the API is simply down).
  const [data, setData] = useState<StoresDirectoryData | null>(initial)
  const [error, setError] = useState(false)
  const [initialFetchFailed, setInitialFetchFailed] = useState(initial === null)
  const [retryToken, setRetryToken] = useState(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce the search box — the query only hits the API after the user
  // pauses typing.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query])

  // A filter change resets to page 1; the data effect below does the fetch.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, city])

  // Single data-fetch effect — one fetch per (query, city, page) change.
  useEffect(() => {
    let cancelled = false
    setError(false)
    setInitialFetchFailed(false)
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (city) params.set('city', city)
    if (debouncedQuery) params.set('q', debouncedQuery)

    fetch(`${API_URL}/v1/public/stores?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: StoresDirectoryData }
        if (!cancelled) setData(json.data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, city, page, retryToken])

  const stores = data?.stores ?? []
  const cities = data?.cities ?? []
  const hasFilters = Boolean(debouncedQuery || city)

  // Docs/content/pages/stores.md: when fewer than 3 stores exist, show the
  // ones that do plus a "be the first store" CTA — never invent stores.
  const showFirstStoreCta = data !== null && (hasFilters ? stores.length === 0 : (data?.total ?? 0) < 3)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Search + city chips */}
      <div className="mb-10">
        <div className="relative max-w-xl mx-auto">
          <Search size={18} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-sand-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by shop name or city — 'kurtis in Jaipur'"
            className="w-full rounded-full border border-sand-200 bg-white pl-11 pr-11 py-3.5 text-sm text-charcoal placeholder:text-sand-400 focus:outline-none focus:ring-2 focus:ring-ink-500 focus:border-ink-500 transition"
            aria-label="Search stores"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-sand-400 hover:text-charcoal transition"
              aria-label="Clear search"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {cities.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setCity(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition border ${
                city === null
                  ? 'bg-ink-600 text-white border-ink-600'
                  : 'bg-white text-sand-600 border-sand-200 hover:border-ink-300'
              }`}
            >
              All cities
            </button>
            {cities.map((c) => (
              <button
                key={c.city}
                onClick={() => setCity(city === c.city ? null : c.city)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition border ${
                  city === c.city
                    ? 'bg-ink-600 text-white border-ink-600'
                    : 'bg-white text-sand-600 border-sand-200 hover:border-ink-300'
                }`}
              >
                {c.city} <span className="opacity-60">({c.count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error state — API unreachable, NOT "no stores yet" (honesty gate) */}
      {(error || initialFetchFailed) && (
        <div className="text-center py-16">
          <p className="text-sand-500 mb-4">We couldn&apos;t load the store directory right now.</p>
          <button
            onClick={() => setRetryToken((t) => t + 1)}
            className="inline-flex items-center gap-2 bg-ink-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-ink-700 transition"
          >
            Try again
          </button>
        </div>
      )}

      {/* Honest empty states (docs/content/pages/stores.md): never invent stores */}
      {!error && !initialFetchFailed && showFirstStoreCta && (
        <div className="text-center py-16">
          {hasFilters ? (
            <>
              <p className="text-lg font-semibold text-charcoal mb-2">No stores match that search</p>
              <p className="text-sand-500 text-sm mb-6">Try a different city or clear the search.</p>
              <button
                onClick={() => {
                  setQuery('')
                  setCity(null)
                }}
                className="bg-ink-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-ink-700 transition"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-charcoal mb-2">Be the first store on Kanchuki</p>
              <p className="text-sand-500 text-sm max-w-md mx-auto mb-6">
                Stores appear here as they complete onboarding — every listing is a real shop with a real
                catalog. If you&apos;re a store owner, you can be here today.
              </p>
              <Link
                href="/pricing"
                className="inline-flex bg-ink-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-ink-700 transition"
              >
                Start your 14-day free trial
              </Link>
            </>
          )}
        </div>
      )}

      {/* Store cards */}
      {!error && !initialFetchFailed && stores.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {stores.map((s) => (
              <SelvedgeCard key={s.public_slug} accent="ink" className="group">
                <Link href={`/${s.public_slug}`} className="block p-5 sm:p-6">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-sand-100 mb-4">
                    <StoreLogo shopName={s.shop_name} logoUrl={s.logo_url} />
                  </div>
                  <h3 className="font-semibold text-charcoal mb-1 group-hover:text-ink-600 transition-colors">
                    {s.shop_name}
                  </h3>
                  <p className="text-sm text-sand-500 mb-4 flex items-center gap-1.5">
                    <MapPin size={14} strokeWidth={1.5} className="text-sand-400" />
                    {s.city ?? 'India'}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-sand-400">
                      {s.product_count.toLocaleString('en-IN')} product{s.product_count === 1 ? '' : 's'}
                    </span>
                    <span className="text-sm font-semibold text-ink-600 group-hover:text-ink-700 transition-colors">
                      Visit store →
                    </span>
                  </div>
                </Link>
              </SelvedgeCard>
            ))}
          </div>

          {/* Pagination */}
          {data && data.total_pages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-4" aria-label="Store directory pages">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-sand-200 text-sm font-medium text-sand-600 hover:border-ink-300 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                <ChevronLeft size={16} strokeWidth={1.5} /> Previous
              </button>
              <span className="text-sm text-sand-500">
                Page {data.page} of {data.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page >= data.total_pages}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-sand-200 text-sm font-medium text-sand-600 hover:border-ink-300 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                Next <ChevronRight size={16} strokeWidth={1.5} />
              </button>
            </nav>
          )}
        </>
      )}

      {/* Trust strip */}
      <div className="mt-16 rounded-xl border border-sand-200 bg-sand-50 p-6 sm:p-8 text-center">
        <Store size={24} strokeWidth={1.5} className="mx-auto mb-3 text-ink-600" />
        <h2 className="font-display text-xl font-semibold text-charcoal mb-2">Are you a store owner?</h2>
        <p className="text-sm text-sand-500 max-w-md mx-auto mb-5">
          Your shop can be here too — with your own catalog page, your own link, and your own QR code.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center bg-ink-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-ink-700 transition active:scale-[0.97]"
          >
            Start your 14-day free trial
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center border border-sand-300 text-sand-700 text-sm font-semibold px-6 py-3 rounded-full hover:border-ink-300 transition active:scale-[0.97]"
          >
            See how it works
          </Link>
        </div>
      </div>
    </div>
  )
}
