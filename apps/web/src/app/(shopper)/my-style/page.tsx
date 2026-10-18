// F-045 PR-4a: /my-style — the signed-in shopper's cross-store feed.
//
// The (shopper) layout already bounces signed-out visitors to /login; a 401
// from the feed (session expired mid-visit) shows the same login link here.
// Cards are Enquire-only (D6): they open the store's page, no "Buy" copy, no
// reason line while rationale_source is "none" (RC-059). Prices are paise and
// go through the shared formatter (RC-055). Kids form + nav entries: PR-4b.

'use client'

import { StyleQuiz } from '@/app/c/[slug]/components/StyleQuiz'
import { formatPriceRange } from '@kanchuki/shared'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AnalyzeSheet } from './AnalyzeSheet'
import { KidsForm } from './KidsForm'
import { PaletteCard } from './PaletteCard'
import { ShortlistBar, useEnquiry } from './ShortlistBar'
import { StyleCardActions } from './StyleCardActions'
import {
  type FeedCard,
  type FeedMeta,
  type FeedSort,
  LOGIN_HREF,
  type StyleProfile,
  fetchFeed,
} from './lib'
import {
  MAX_PER_STORE,
  type ShortItem,
  groupByStore,
  loadShortlist,
  saveShortlist,
  toShortItem,
} from './shortlist'

const SORTS: { value: FeedSort; label: string }[] = [
  { value: 'best', label: 'Best match' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'price', label: 'Price' },
]
// Budget caps in paise.
const BUDGETS = [50000, 100000, 200000, 300000, 500000, 1000000]
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL']
const OCCASIONS = ['Daily Wear', 'Party / Festive', 'Wedding / Bridal', 'Office / Formal']
const RADII = [5, 10, 25, 50]

type View =
  | { kind: 'loading' }
  | { kind: 'ok'; data: FeedCard[]; meta: FeedMeta }
  | { kind: 'unauthorized' }
  | { kind: 'error' }

export default function MyStylePage() {
  const [sort, setSort] = useState<FeedSort>('best')
  const [page, setPage] = useState(1)
  const [budget, setBudget] = useState('')
  const [size, setSize] = useState('')
  const [occasion, setOccasion] = useState('')
  const [where, setWhere] = useState<{ lat: number; lng: number } | null>(null)
  const [radius, setRadius] = useState(25)
  const [geoDenied, setGeoDenied] = useState(false)
  const [showQuiz, setShowQuiz] = useState(false)
  const [showKids, setShowKids] = useState(false)
  const [showAnalyze, setShowAnalyze] = useState(false)
  // Kept across refetches so the palette card does not flash away while the feed reloads.
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null)
  const [kids, setKids] = useState<{ who: string; age: string } | null>(null)
  // Bumped to refetch with unchanged filters (retry, quiz saved).
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [shortlist, setShortlist] = useState<ShortItem[]>([])
  const enquiry = useEnquiry()
  const groups = groupByStore(shortlist)

  // Read after mount so the server and first client render agree.
  useEffect(() => setShortlist(loadShortlist()), [])

  function updateShortlist(next: ShortItem[]) {
    setShortlist(next)
    saveShortlist(next)
  }

  function toggleShortlist(card: FeedCard) {
    if (shortlist.some((i) => i.id === card.id)) {
      updateShortlist(shortlist.filter((i) => i.id !== card.id))
      return
    }
    const item = toShortItem(card)
    if (item) updateShortlist([...shortlist, item])
  }

  function enquireOne(card: FeedCard) {
    const item = toShortItem(card)
    if (item) void enquiry.send([{ slug: item.slug, shop_name: item.shop_name, items: [item] }])
  }

  useEffect(() => {
    const ctrl = new AbortController()
    setView({ kind: 'loading' })
    fetchFeed(
      {
        sort,
        page,
        limit: 12,
        ...(budget ? { budget_max: Number(budget) } : {}),
        ...(size ? { size } : {}),
        ...(occasion ? { occasion } : {}),
        ...(where ? { ...where, radius_km: radius } : {}),
      },
      ctrl.signal,
    )
      .then((r) => {
        setView(r)
        if (r.kind === 'ok') setStyleProfile(r.meta.style_profile ?? null)
      })
      .catch((e: unknown) => {
        // A superseded request aborts; that is not a failure (RC-014).
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!ctrl.signal.aborted) setView({ kind: 'error' })
      })
    return () => ctrl.abort()
  }, [sort, page, budget, size, occasion, where, radius, nonce])

  // Any filter change restarts at page 1.
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  function goToPage(next: number) {
    setPage(next)
    // The pager swaps the list in place; without this the new page opens
    // scrolled to wherever the old one ended (RC-053).
    window.scrollTo(0, 0)
  }

  function nearMe() {
    if (!navigator.geolocation) {
      setGeoDenied(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeoDenied(false)
        reset(setWhere)({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => setGeoDenied(true),
    )
  }

  const select = 'rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-700'

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-lg border border-stone-200 p-5">
        <h1 className="text-xl font-semibold text-stone-900">My Style</h1>
        <p className="text-sm text-stone-500 mt-1">
          Pieces from stores near you, picked for your taste.
        </p>
        <button
          type="button"
          onClick={() => setShowAnalyze(true)}
          className="mt-3 mr-4 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-900"
        >
          Selfie / full body
        </button>
        <button
          type="button"
          onClick={() => setShowQuiz((v) => !v)}
          className="mt-3 text-sm font-medium text-amber-700"
        >
          {showQuiz ? 'Close quiz' : 'Take the quick quiz'}
        </button>
        {showQuiz && (
          <div className="mt-3">
            <StyleQuiz
              storeSlug="my-style"
              onComplete={() => {
                setShowQuiz(false)
                setNonce((n) => n + 1)
              }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowKids((v) => !v)}
          className="mt-3 ml-4 text-sm font-medium text-amber-700"
        >
          {showKids ? 'Close' : 'For my child'}
        </button>
        {kids && (
          <p className="mt-2 text-xs text-stone-600">
            Shopping for: {kids.who}, {kids.age}{' '}
            <button type="button" onClick={() => setKids(null)} className="underline">
              Clear
            </button>
          </p>
        )}
        {showKids && (
          <KidsForm
            onApply={(need) => {
              // Session state only; only occasion + budget reach the feed.
              setKids({ who: need.who, age: need.age })
              setOccasion(need.occasion)
              setBudget(need.budget)
              setPage(1)
              setShowKids(false)
            }}
          />
        )}
      </section>

      {styleProfile && (
        <PaletteCard
          profile={styleProfile}
          onRetake={() => setShowAnalyze(true)}
          onCleared={() => {
            setStyleProfile(null)
            setNonce((n) => n + 1)
          }}
        />
      )}

      <section className="space-y-3">
        <div className="flex gap-2" role="group" aria-label="Sort">
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={sort === s.value}
              onClick={() => reset(setSort)(s.value)}
              className={`px-3 py-1.5 rounded-full text-sm ${
                sort === s.value ? 'bg-stone-900 text-white' : 'bg-white border border-stone-300 text-stone-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Budget" className={select} value={budget} onChange={(e) => reset(setBudget)(e.target.value)}>
            <option value="">Any budget</option>
            {BUDGETS.map((b) => (
              <option key={b} value={b}>
                Up to {formatPriceRange(b, null).replace('/-', '')}
              </option>
            ))}
          </select>
          <select aria-label="Size" className={select} value={size} onChange={(e) => reset(setSize)(e.target.value)}>
            <option value="">Any size</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Occasion" className={select} value={occasion} onChange={(e) => reset(setOccasion)(e.target.value)}>
            <option value="">Any occasion</option>
            {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <button type="button" onClick={nearMe} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700">
            Near me
          </button>
          {where && (
            <select aria-label="Distance" className={select} value={radius} onChange={(e) => reset(setRadius)(Number(e.target.value))}>
              {RADII.map((r) => <option key={r} value={r}>Within {r} km</option>)}
            </select>
          )}
        </div>
        {geoDenied && (
          <p className="text-xs text-stone-500">Location is off, so we are using your city.</p>
        )}
      </section>

      <Results
        view={view}
        page={page}
        onPage={goToPage}
        onRetry={() => setNonce((n) => n + 1)}
        shortlist={shortlist}
        busy={enquiry.busy}
        onToggle={toggleShortlist}
        onEnquire={enquireOne}
      />
      {/* Room so the sticky bar never covers the pager. */}
      {groups.length > 0 && <div className="h-48" aria-hidden="true" />}
      <ShortlistBar
        groups={groups}
        enquiry={enquiry}
        onRemove={(id) => updateShortlist(shortlist.filter((i) => i.id !== id))}
      />
      {showAnalyze && (
        <AnalyzeSheet
          onClose={() => setShowAnalyze(false)}
          onDone={() => setNonce((n) => n + 1)}
        />
      )}
    </div>
  )
}

function Results({
  view,
  page,
  onPage,
  onRetry,
  shortlist,
  busy,
  onToggle,
  onEnquire,
}: {
  view: View
  page: number
  onPage: (p: number) => void
  onRetry: () => void
  shortlist: ShortItem[]
  busy: boolean
  onToggle: (c: FeedCard) => void
  onEnquire: (c: FeedCard) => void
}) {
  if (view.kind === 'loading') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[3/4] bg-stone-200 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (view.kind === 'unauthorized') {
    return (
      <p className="text-center py-10 text-stone-500">
        Your session ended. <Link href={LOGIN_HREF} className="text-amber-700 font-medium">Please log in</Link> to see your feed.
      </p>
    )
  }
  if (view.kind === 'error') {
    return (
      <div className="text-center py-10">
        <p className="text-stone-500 text-sm">We could not load your feed.</p>
        <button type="button" onClick={onRetry} className="mt-2 text-sm font-medium text-amber-700">
          Try again
        </button>
      </div>
    )
  }

  const { data, meta } = view
  if (data.length === 0) {
    return (
      <p className="text-center py-10 text-stone-500 text-sm">
        No matches yet. Try a wider budget or distance, or take the quick quiz.
      </p>
    )
  }
  const pages = Math.ceil(meta.total / meta.limit)

  return (
    <div className="space-y-4">
      {meta.location_scope === 'nationwide' && (
        <p className="text-xs text-stone-500">Showing stores from all of India. Tap Near me to see nearby stores first.</p>
      )}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {data.map((c) => (
          <li key={c.id} className="bg-white rounded-lg border border-stone-200 overflow-hidden flex flex-col">
            <div className="aspect-[3/4] bg-stone-100">
              {c.primary_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- remote store photo, sized by the grid
                <img src={c.primary_photo_url} alt={c.name ?? 'Product'} className="w-full h-full object-cover" loading="lazy" />
              )}
            </div>
            <div className="p-3 flex-1 flex flex-col gap-1">
              {c.retailer.slug ? (
                <Link
                  href={`/${c.retailer.slug}/all-${c.retailer.slug}/product/${c.id}`}
                  className="text-sm font-medium text-stone-900 truncate"
                >
                  {c.name}
                </Link>
              ) : (
                <p className="text-sm font-medium text-stone-900 truncate">{c.name}</p>
              )}
              <p className="text-sm text-stone-700">{formatPriceRange(c.price_min, c.price_max)}</p>
              <p className="text-xs text-stone-500 truncate">
                {[c.retailer.shop_name, c.retailer.city, c.distance_km != null ? `${c.distance_km} km` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <StyleCardActions
                card={c}
                saved={shortlist.some((i) => i.id === c.id)}
                full={shortlist.filter((i) => i.slug === c.retailer.slug).length >= MAX_PER_STORE}
                busy={busy}
                onToggle={() => onToggle(c)}
                onEnquire={() => onEnquire(c)}
              />
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="text-sm text-stone-700 disabled:opacity-40">
            Prev
          </button>
          <span className="text-xs text-stone-500">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="text-sm text-stone-700 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  )
}
