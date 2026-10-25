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
import { PushOptIn } from '@/components/PushOptIn'
import { motion } from 'framer-motion'
import { ChevronRight, Clock, MapPin, QrCode, Store, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CARD, ITEM, LIST, Notice, SKELETON } from '../ui'
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
      <div className="space-y-4" aria-busy="true">
        <div className={`h-24 rounded-3xl ${SKELETON}`} />
        <div className={`h-20 rounded-3xl ${SKELETON}`} />
        <div className={`h-20 rounded-3xl ${SKELETON}`} />
      </div>
    )
  }

  if (state === 'anonymous') {
    return (
      <Notice icon={UserRound}>
        <p>Please log in to see the stores you&apos;ve visited.</p>
      </Notice>
    )
  }

  return (
    <motion.div variants={LIST} initial="hidden" animate="show" className="space-y-4">
      <motion.section variants={ITEM} className={`${CARD} p-5 flex items-center gap-4`}>
        <span className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-spaceCadet-900 to-tyrian-800 flex items-center justify-center shadow-lg shadow-spaceCadet-900/20">
          <Store aria-hidden className="h-6 w-6 text-white" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-spaceCadet-900">My Stores</h1>
          <p className="text-sm text-heliotrope-500 mt-0.5">
            {stores.length === 0
              ? 'Stores you scan or shop with will show up here.'
              : `${stores.length} ${stores.length === 1 ? 'store' : 'stores'} you've visited.`}
          </p>
        </div>
      </motion.section>

      {/* F-036 Phase A: a non-empty list is proof of at least one verified
          store visit, which is the eligibility bar for the install ask. */}
      {stores.length > 0 && <InstallPrompt />}
      {/* F-036 Phase B: same eligibility bar — only a shopper with a store visit is asked. */}
      {stores.length > 0 && <PushOptIn />}

      {stores.length === 0 ? (
        <motion.div variants={ITEM}>
          <Notice icon={QrCode}>
            <p>
              No stores yet. Scan a store&apos;s QR code or open a catalog link to
              start your list.
            </p>
          </Notice>
        </motion.div>
      ) : (
        <ul className="space-y-3">
          {stores.map((store) => (
            <StoreRow key={store.retailer_id} store={store} />
          ))}
        </ul>
      )}
    </motion.div>
  )
}

function StoreRow({ store }: { store: StoreVisitRow }) {
  const lastVisit = formatLastVisit(store.last_visited_at)

  const card = (
    <div
      className={`${CARD} min-h-[76px] p-3 pr-4 flex items-center gap-3.5 transition-[border-color,box-shadow] ${
        store.href ? 'group-hover:border-heliotrope-400 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-fuchsia-500/50' : ''
      }`}
    >
      <div className="w-14 h-14 rounded-2xl bg-fuchsia-500/15 overflow-hidden flex-shrink-0 flex items-center justify-center">
        {store.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail, no LCP benefit from next/image
          <img
            src={store.logo_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xl font-bold text-fuchsia-600">
            {store.shop_name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-bold text-spaceCadet-900 truncate">{store.shop_name}</p>
        <p className="text-xs text-heliotrope-500 mt-1 flex items-center gap-x-3 min-w-0">
          {store.city && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{store.city}</span>
            </span>
          )}
          {lastVisit && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              {lastVisit}
            </span>
          )}
        </p>
      </div>

      {store.href && (
        <span className="h-9 w-9 shrink-0 rounded-full bg-lavender-100 flex items-center justify-center transition-colors group-hover:bg-fuchsia-500/15">
          <ChevronRight aria-hidden className="h-4 w-4 text-heliotrope-600" />
          <span className="sr-only">View catalog</span>
        </span>
      )}
    </div>
  )

  // A store with no storefront slug has no catalog page to open yet.
  if (!store.href) {
    return (
      <motion.li variants={ITEM}>
        <div>
          <div className="opacity-70">{card}</div>
          <p className="text-xs text-heliotrope-500 mt-1.5 ml-4">
            This store hasn&apos;t published a catalog page yet.
          </p>
        </div>
      </motion.li>
    )
  }

  return (
    <motion.li variants={ITEM}>
      <Link href={store.href} className="block group rounded-3xl focus-visible:outline-none" prefetch>
        {card}
      </Link>
    </motion.li>
  )
}
