'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Store, X } from 'lucide-react'
import Link from 'next/link'
import NearMeBar from '@/components/site/NearMeBar'
import StoreCard from '@/components/site/StoreCard'
import { locationParams, useUserLocation } from '@/lib/nearby-stores'
import ShopperEntry from './ShopperEntry'
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
  const loc = useUserLocation()
  // Nearby found nothing within 10 km → fall back to the full directory.
  const [nearbyEmpty, setNearbyEmpty] = useState(false)

  // Debounce the search box — the query only hits the API after the user
  // pauses typing.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query])

  // Explicit browsing (a search or a city chip) beats "near me".
  const nearbyCoords = debouncedQuery || city || nearbyEmpty ? null : loc.coords

  // A filter change resets to page 1; the data effect below does the fetch.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, city, nearbyCoords])

  // Single data-fetch effect — one fetch per (query, city, location, page) change.
  useEffect(() => {
    let cancelled = false
    setError(false)
    setInitialFetchFailed(false)
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (city) params.set('city', city)
    if (debouncedQuery) params.set('q', debouncedQuery)
    for (const [k, v] of Object.entries(locationParams(nearbyCoords))) params.set(k, v)

    fetch(`${API_URL}/v1/public/stores?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: StoresDirectoryData }
        if (cancelled) return
        if (json.data.nearby && json.data.stores.length === 0) {
          setNearbyEmpty(true) // re-runs this effect without coordinates
          return
        }
        setData(json.data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, city, page, retryToken, nearbyCoords])

  const stores = data?.stores ?? []
  const cities = data?.cities ?? []
  const hasFilters = Boolean(debouncedQuery || city)

  // Docs/content/pages/stores.md: when fewer than 3 stores exist, show the
  // ones that do plus a "be the first store" CTA — never invent stores.
  const showFirstStoreCta = data !== null && (hasFilters ? stores.length === 0 : (data?.total ?? 0) < 3)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Customer entry point — "Log in" when signed out, the shopper's own
          name when they hold a passport. /stores only; see ShopperEntry. */}
      <div className="mb-6 flex justify-end">
        <ShopperEntry />
      </div>

      <NearMeBar loc={loc} radiusKm={data?.nearby ? data.radius_km : null} empty={nearbyEmpty} />

      {/* Search + city chips */}
      <div className="mb-10">
        <div className="relative max-w-xl mx-auto">
          <Search size={18} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-carbon/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by shop name or city — 'kurtis in Jaipur'"
            className="w-full rounded-full border border-carbon/15 bg-white pl-11 pr-11 py-3.5 text-sm text-carbon placeholder:text-carbon/40 focus:outline-none focus:ring-2 focus:ring-cobalt-500 focus:border-cobalt-500 transition"
            aria-label="Search stores"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-carbon/40 hover:text-carbon transition"
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
                  ? 'bg-carbon text-cream border-carbon'
                  : 'bg-white text-carbon/60 border-carbon/15 hover:border-cobalt-500'
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
                    ? 'bg-carbon text-cream border-carbon'
                    : 'bg-white text-carbon/60 border-carbon/15 hover:border-cobalt-500'
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
          <p className="text-carbon/60 mb-4">We couldn&apos;t load the store directory right now.</p>
          <button
            onClick={() => setRetryToken((t) => t + 1)}
            className="inline-flex items-center gap-2 bg-volt text-carbon text-sm font-semibold px-6 py-3 rounded-full hover:bg-volt-600 transition"
          >
            Try again
          </button>
        </div>
      )}

      {/* Honest empty states (docs/PLAN.md (Stores page copy)): never invent stores */}
      {!error && !initialFetchFailed && showFirstStoreCta && (
        <div className="text-center py-16">
          {hasFilters ? (
            <>
              <p className="font-display text-lg font-semibold text-carbon mb-2">No stores match that search</p>
              <p className="text-carbon/60 text-sm mb-6">Try a different city or clear the search.</p>
              <button
                onClick={() => {
                  setQuery('')
                  setCity(null)
                }}
                className="bg-volt text-carbon text-sm font-semibold px-6 py-3 rounded-full hover:bg-volt-600 transition"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-semibold text-carbon mb-2">Be the first store on Kanchuki</p>
              <p className="text-carbon/60 text-sm max-w-md mx-auto mb-6">
                Stores appear here as they complete onboarding — every listing is a real shop with a real
                catalog. If you&apos;re a store owner, you can be here today.
              </p>
              <Link
                href="/pricing"
                className="inline-flex bg-volt text-carbon text-sm font-semibold px-6 py-3 rounded-full hover:bg-volt-600 transition"
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
          <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
            {stores.map((s) => (
              <StoreCard key={s.public_slug} store={s} />
            ))}
          </div>

          {/* Pagination */}
          {data && data.total_pages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-4" aria-label="Store directory pages">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-carbon/15 text-sm font-medium text-carbon/60 hover:border-cobalt-500 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                <ChevronLeft size={16} strokeWidth={1.5} /> Previous
              </button>
              <span className="text-sm text-carbon/50">
                Page {data.page} of {data.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page >= data.total_pages}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-carbon/15 text-sm font-medium text-carbon/60 hover:border-cobalt-500 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                Next <ChevronRight size={16} strokeWidth={1.5} />
              </button>
            </nav>
          )}
        </>
      )}

      {/* Trust strip */}
      <div className="mt-16 rounded-2xl border border-carbon/10 bg-white p-6 sm:p-8 text-center">
        <Store size={24} strokeWidth={1.5} className="mx-auto mb-3 text-cobalt-600" />
        <h2 className="font-display text-xl font-semibold text-carbon mb-2">Are you a store owner?</h2>
        <p className="text-sm text-carbon/60 max-w-md mx-auto mb-5">
          Your shop can be here too — with your own catalog page, your own link, and your own QR code.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center bg-volt text-carbon text-sm font-semibold px-6 py-3 rounded-full hover:bg-volt-600 transition active:scale-[0.97]"
          >
            Start your 14-day free trial
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center border border-carbon/20 text-carbon/70 text-sm font-semibold px-6 py-3 rounded-full hover:border-cobalt-500 hover:text-cobalt-600 transition active:scale-[0.97]"
          >
            See how it works
          </Link>
        </div>
      </div>
    </div>
  )
}
