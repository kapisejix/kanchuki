// F-036 Phase A (Task 1): /my-stores — the shopper's visited-store list.
//
// Reads the passport session and lists every CustomerStoreVisit for the
// signed-in account, newest first. Each row taps through to the store's
// existing catalog route (/{slug}) — the same page the QR flow opens, so
// there is no second browsing mechanism to keep in sync.
//
// Scoping note: the list comes from GET /api/passport/stores, which resolves
// the account from the passport cookie server-side. This page never passes a
// customer id and never merges local state into the response, so it cannot
// show another shopper's stores.

'use client'

import { InstallPrompt } from '@/components/InstallPrompt'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatLastVisit, mapStoreVisits, type StoreVisitRow } from './lib'

type LoadState = 'loading' | 'anonymous' | 'ready'

export default function MyStoresPage() {
  const [stores, setStores] = useState<StoreVisitRow[]>([])
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/passport/stores', { credentials: 'include' })
        if (cancelled) return
        if (res.status === 401) {
          setState('anonymous')
          return
        }
        if (!res.ok) {
          // Keep the page quiet on a blip — the reload affordance is below.
          setState('anonymous')
          return
        }
        const rows = mapStoreVisits(await res.json())
        if (cancelled) return
        setStores(rows)
        setState('ready')
      } catch {
        if (!cancelled) setState('anonymous')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-20 bg-stone-200 rounded-lg animate-pulse" />
        <div className="h-24 bg-stone-200 rounded-lg animate-pulse" />
        <div className="h-24 bg-stone-200 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (state === 'anonymous') {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">
          Please log in to see the stores you&apos;ve visited.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-stone-200 p-6">
        <h1 className="text-xl font-semibold text-stone-900">My Stores</h1>
        <p className="text-sm text-stone-500 mt-1">
          {stores.length === 0
            ? 'Stores you scan or shop with will show up here.'
            : `${stores.length} ${stores.length === 1 ? 'store' : 'stores'} you've visited.`}
        </p>
      </section>

      {/* F-036 Phase A: a non-empty list is proof of at least one verified
          store visit, which is the eligibility bar for the install ask. */}
      {stores.length > 0 && <InstallPrompt />}

      {stores.length === 0 ? (
        <section className="bg-white rounded-lg border border-stone-200 p-8 text-center">
          <p className="text-stone-500 text-sm">
            No stores yet. Scan a store&apos;s QR code or open a catalog link to
            start your list.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {stores.map((store) => (
            <StoreRow key={store.retailer_id} store={store} />
          ))}
        </ul>
      )}
    </div>
  )
}

function StoreRow({ store }: { store: StoreVisitRow }) {
  const lastVisit = formatLastVisit(store.last_visited_at)

  const card = (
    <div className="bg-white rounded-lg border border-stone-200 p-4 flex items-center gap-4 transition-colors group-hover:border-amber-300">
      <div className="w-12 h-12 rounded-lg bg-amber-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
        {store.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail, no LCP benefit from next/image
          <img
            src={store.logo_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg font-semibold text-amber-700">
            {store.shop_name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-stone-900 truncate">{store.shop_name}</p>
        <p className="text-xs text-stone-500 truncate">
          {[store.city, lastVisit].filter(Boolean).join(' · ')}
        </p>
      </div>

      {store.href && (
        <span className="text-xs text-amber-700 font-medium flex-shrink-0">
          View catalog →
        </span>
      )}
    </div>
  )

  // A store with no storefront slug has no catalog page to open yet.
  if (!store.href) {
    return (
      <li>
        <div className="opacity-70">
          {card}
          <p className="text-xs text-stone-400 mt-1 ml-1">
            This store hasn&apos;t published a catalog page yet.
          </p>
        </div>
      </li>
    )
  }

  return (
    <li>
      <Link href={store.href} className="block group" prefetch>
        {card}
      </Link>
    </li>
  )
}
