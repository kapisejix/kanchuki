// F-045 PR-4a: /my-style — the signed-in shopper's cross-store feed.
//
// The (shopper) layout already bounces signed-out visitors to /login; a 401
// from the feed (session expired mid-visit) shows the same login link here.
// Cards are Enquire-only (D6): they open the store's page, no "Buy" copy, no
// reason line while rationale_source is "none" (RC-059). Prices are paise and
// go through the shared formatter (RC-055). Kids form + nav entries: PR-4b.

'use client'

import { StyleQuiz } from '@/app/c/[slug]/components/StyleQuiz'
import { type GarmentDescriptor, PRODUCT_OCCASIONS, formatPriceRange } from '@kanchuki/shared'
import { Sheet } from '@/components/Sheet'
import {
  AlertCircle, Baby, Camera, ChevronLeft, ChevronRight, ClipboardList, Globe2, LocateFixed, MapPin,
  ScanSearch, SearchX, SlidersHorizontal, Sparkles, UserRound, X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TEXT, CARD, IconTile, Notice, SEGMENTED, SELECT, chip, segment } from '../ui'
import { AnalyzeSheet } from './AnalyzeSheet'
import type { AnalyzeMode } from './analyze'
import { KidsForm } from './KidsForm'
import { CardSkeleton, LookPanel, type LookView } from './LookPanel'
import { PaletteCard } from './PaletteCard'
import { ShortlistBar, useEnquiry } from './ShortlistBar'
import { StyleCard } from './StyleCard'
import {
  type FeedCard,
  type FeedMeta,
  type FeedSort,
  type FeedTab,
  LOGIN_HREF,
  type StyleProfile,
  describeGarment,
  fetchFeed,
  fetchLook,
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
const LOOK_KEY = 'my-style:look-anchor'

// Below Tailwind's `sm`, budget/size/occasion move into a bottom sheet. With no
// matchMedia (jsdom, very old browsers) they stay inline, so exactly one copy of
// each labelled <select> is ever in the DOM.
const PHONE = '(max-width: 639px)'
function useIsPhone() {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia?.(PHONE)
      m?.addEventListener?.('change', onChange)
      return () => m?.removeEventListener?.('change', onChange)
    },
    () => window.matchMedia?.(PHONE)?.matches ?? false,
    () => false,
  )
}

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
  // Tabs: Festival / Trending exist only while the feed says something is behind them.
  const [tab, setTab] = useState<FeedTab | 'look'>('foryou')
  // Complete the look (PR-10b): the last anchor, kept for the session so the tab survives a
  // reload. It is a product id only; the tab hides until one is picked.
  const [lookAnchor, setLookAnchor] = useState<string | null>(null)
  const [lookView, setLookView] = useState<LookView>({ kind: 'loading' })
  const [tabs, setTabs] = useState<FeedMeta['tabs']>(undefined)
  // The Occasion tab's chip (canonical name), separate from the filter dropdown above.
  const [tabOccasion, setTabOccasion] = useState('')
  const [where, setWhere] = useState<{ lat: number; lng: number } | null>(null)
  const [radius, setRadius] = useState(25)
  const [geoDenied, setGeoDenied] = useState(false)
  const [showQuiz, setShowQuiz] = useState(false)
  const [showKids, setShowKids] = useState(false)
  // Which photo sheet is open: selfie (palette) or garment (find similar).
  const [analyzeMode, setAnalyzeMode] = useState<AnalyzeMode | null>(null)
  // Find similar: the garment description, kept in page state only and sent with each feed
  // request. Nothing is stored; a reload clears it.
  const [similar, setSimilar] = useState<GarmentDescriptor | null>(null)
  // Kept across refetches so the palette card does not flash away while the feed reloads.
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null)
  const [kids, setKids] = useState<{ who: string; age: string } | null>(null)
  // Bumped to refetch with unchanged filters (retry, quiz saved).
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [shortlist, setShortlist] = useState<ShortItem[]>([])
  const enquiry = useEnquiry()
  const phone = useIsPhone()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const groups = groupByStore(shortlist)

  // Read after mount so the server and first client render agree.
  useEffect(() => setShortlist(loadShortlist()), [])

  // ?look=<id> (from a store's product sheet) wins over the remembered anchor.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('look')
    if (fromUrl) {
      openLook(fromUrl)
      return
    }
    try {
      setLookAnchor(window.sessionStorage.getItem(LOOK_KEY))
    } catch {
      // storage blocked: no remembered anchor, the tab simply stays hidden
    }
  }, [])

  function openLook(id: string) {
    setLookAnchor(id)
    setTab('look')
    setPage(1)
    window.scrollTo(0, 0)
    try {
      window.sessionStorage.setItem(LOOK_KEY, id)
    } catch {
      // not remembered across a reload; this visit still works
    }
  }

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
    if (tab === 'look') return // the look tab has its own request below
    const ctrl = new AbortController()
    setView({ kind: 'loading' })
    fetchFeed(
      {
        sort,
        tab,
        page,
        limit: 12,
        ...(budget ? { budget_max: Number(budget) } : {}),
        ...(size ? { size } : {}),
        ...(tab === 'occasion' ? (tabOccasion ? { occasion: tabOccasion } : {}) : occasion ? { occasion } : {}),
        ...(where ? { ...where, radius_km: radius } : {}),
        ...(similar ? { similar } : {}),
      },
      ctrl.signal,
    )
      .then((r) => {
        setView(r)
        if (r.kind === 'ok') {
          setStyleProfile(r.meta.style_profile ?? null)
          setTabs(r.meta.tabs)
          // The tab just lost its data (festival ended, trend retired): fall back to the feed.
          const t = r.meta.tabs
          if ((tab === 'festival' && !t?.festival) || (tab === 'trending' && !t?.trending)) {
            setTab('foryou')
          }
        }
      })
      .catch((e: unknown) => {
        // A superseded request aborts; that is not a failure (RC-014).
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!ctrl.signal.aborted) setView({ kind: 'error' })
      })
    return () => ctrl.abort()
  }, [sort, tab, tabOccasion, page, budget, size, occasion, where, radius, similar, nonce])

  useEffect(() => {
    if (tab !== 'look' || !lookAnchor) return
    const ctrl = new AbortController()
    setLookView({ kind: 'loading' })
    fetchLook(lookAnchor, where ? { ...where, radius_km: radius } : null, ctrl.signal)
      .then(setLookView)
      .catch((e: unknown) => {
        // A superseded request aborts; that is not a failure (RC-014).
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!ctrl.signal.aborted) setLookView({ kind: 'error' })
      })
    return () => ctrl.abort()
  }, [tab, lookAnchor, where, radius, nonce])

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

  const activeFilters = [budget, size, occasion].filter(Boolean).length + (where ? 1 : 0)

  // Rendered once: inline from `sm`, inside the filter sheet on a phone.
  const filterControls = (stacked: boolean) => {
    const sel = stacked ? `${SELECT} w-full` : `${SELECT} shrink-0`
    const field = (label: string, control: React.ReactNode) =>
      stacked ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-heliotrope-500 px-1" aria-hidden="true">{label}</p>
          {control}
        </div>
      ) : (
        control
      )
    return (
      <>
        {field(
          'Budget',
          <select aria-label="Budget" className={sel} value={budget} onChange={(e) => reset(setBudget)(e.target.value)}>
            <option value="">Any budget</option>
            {BUDGETS.map((b) => (
              <option key={b} value={b}>
                Up to {formatPriceRange(b, null).replace('/-', '')}
              </option>
            ))}
          </select>,
        )}
        {field(
          'Size',
          <select aria-label="Size" className={sel} value={size} onChange={(e) => reset(setSize)(e.target.value)}>
            <option value="">Any size</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>,
        )}
        {field(
          'Occasion',
          <select aria-label="Occasion" className={sel} value={occasion} onChange={(e) => reset(setOccasion)(e.target.value)}>
            <option value="">Any occasion</option>
            {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>,
        )}
        {where &&
          field(
            'Distance',
            <select aria-label="Distance" className={sel} value={radius} onChange={(e) => reset(setRadius)(Number(e.target.value))}>
              {RADII.map((r) => <option key={r} value={r}>Within {r} km</option>)}
            </select>,
          )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <section className={`${CARD} p-5`}>
        <div className="flex items-start gap-3.5">
          <span className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-spaceCadet-900 to-tyrian-800 flex items-center justify-center shadow-lg shadow-spaceCadet-900/20">
            <Sparkles aria-hidden className="h-6 w-6 text-white" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-xl font-bold text-spaceCadet-900">My Style</h1>
            <p className="text-sm text-heliotrope-500 mt-0.5">
              Pieces from stores near you, picked for your taste.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {(
            [
              ['selfie', Camera, 'Selfie / full body', 'Colours that suit you'],
              ['garment', ScanSearch, 'Find similar', 'Match a photo'],
            ] as const
          ).map(([mode, Icon, label, hint]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAnalyzeMode(mode)}
              className="min-h-[88px] p-3 flex flex-col items-start justify-between gap-2 text-left rounded-2xl bg-lavender-50 border border-lavender-100 hover:bg-lavender-100 hover:border-lavender-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50"
            >
              <span className="h-8 w-8 rounded-xl bg-white flex items-center justify-center shadow-sm shadow-spaceCadet-900/10">
                <Icon aria-hidden className="h-4 w-4 text-fuchsia-600" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-spaceCadet-900 leading-tight">{label}</span>
                <span className="block text-xs text-heliotrope-500 mt-0.5">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-1 mt-2 -mx-2">
          <button type="button" onClick={() => setShowQuiz((v) => !v)} aria-expanded={showQuiz} className={BTN_TEXT}>
            <ClipboardList aria-hidden className="h-4 w-4" />
            {showQuiz ? 'Close quiz' : 'Take the quick quiz'}
          </button>
          <button type="button" onClick={() => setShowKids((v) => !v)} aria-expanded={showKids} className={BTN_TEXT}>
            <Baby aria-hidden className="h-4 w-4" />
            {showKids ? 'Close' : 'For my child'}
          </button>
        </div>
        {kids && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 pl-3 text-xs font-semibold text-fuchsia-600">
            Shopping for: {kids.who}, {kids.age}{' '}
            <button
              type="button"
              onClick={() => setKids(null)}
              className="min-h-9 px-3 rounded-full underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50"
            >
              Clear
            </button>
          </p>
        )}
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
          onRetake={() => setAnalyzeMode('selfie')}
          onCleared={() => {
            setStyleProfile(null)
            setNonce((n) => n + 1)
          }}
        />
      )}

      {similar && (
        <div className={`${CARD} p-4 flex items-start gap-3`}>
          <IconTile icon={ScanSearch} />
          <p className="min-w-0 flex-1 pt-1.5 text-sm text-heliotrope-500">
            Looking for: <span className="font-semibold text-spaceCadet-900">{describeGarment(similar)}</span>
            {view.kind === 'ok' && view.meta.similar?.source === 'attributes' && (
              <span className="block text-xs mt-1">
                Matched on colour, style and work. Closer matching is not available right now.
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setSimilar(null)
              setPage(1)
            }}
            className={`${BTN_TEXT} shrink-0 -my-1`}
          >
            <X aria-hidden className="h-4 w-4" />
            Clear
          </button>
        </div>
      )}

      <nav
        className={`${SEGMENTED} overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        aria-label="Feed tabs"
      >
        {(
          [
            ['foryou', 'For you'],
            ...(tabs?.festival ? [['festival', tabs.festival.name]] : []),
            ['occasion', 'Occasion'],
            ...(tabs?.trending ? [['trending', 'Trending']] : []),
            ...(lookAnchor ? [['look', 'Complete the look']] : []),
          ] as [FeedTab | 'look', string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => {
              setTab(value)
              setPage(1)
            }}
            className={`${segment(tab === value)} flex-1`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'occasion' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Occasion">
            {PRODUCT_OCCASIONS.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={tabOccasion === o}
                onClick={() => {
                  setTabOccasion(tabOccasion === o ? '' : o)
                  setPage(1)
                }}
                className={chip(tabOccasion === o)}
              >
                {o}
              </button>
            ))}
          </div>
          {!tabOccasion && <p className="text-xs text-heliotrope-500 px-1">Pick an occasion to see pieces chosen for it first.</p>}
          {tabOccasion && view.kind === 'ok' && view.meta.occasion_matches === 0 && (
            <p className="text-xs text-heliotrope-500 px-1">
              Nothing near you is marked for {tabOccasion} yet, so this is your general feed.
            </p>
          )}
        </div>
      )}

      <section className="space-y-2" hidden={tab === 'look'} aria-label="Sort and filter">
        {/* One scrolling chip bar; it bleeds to the screen edge on a phone. */}
        <div className="-mx-4 px-4 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className={`${SEGMENTED} shrink-0`} role="group" aria-label="Sort">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={sort === s.value}
                onClick={() => reset(setSort)(s.value)}
                className={segment(sort === s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={nearMe} className={chip(Boolean(where))}>
            <LocateFixed aria-hidden className={`h-4 w-4 ${where ? 'text-fuchsia-400' : 'text-heliotrope-500'}`} />
            Near me
          </button>
          {phone ? (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className={chip(activeFilters > 0)}
            >
              <SlidersHorizontal aria-hidden className={`h-4 w-4 ${activeFilters > 0 ? 'text-fuchsia-400' : 'text-heliotrope-500'}`} />
              Filters
              {activeFilters > 0 && (
                <span className="ml-0.5 min-w-5 h-5 px-1.5 rounded-full bg-fuchsia-600 text-white text-xs leading-5 text-center tabular-nums">
                  {activeFilters}
                </span>
              )}
            </button>
          ) : (
            filterControls(false)
          )}
        </div>
        {geoDenied && (
          <p className="text-xs text-heliotrope-500 px-1 flex items-center gap-1.5">
            <MapPin aria-hidden className="h-3.5 w-3.5" />
            Location is off, so we are using your city.
          </p>
        )}
      </section>

      <Sheet
        open={phone && filtersOpen}
        onClose={() => setFiltersOpen(false)}
        ariaLabel="Filters"
        overlayClassName="z-[70] bg-spaceCadet-950/60 flex items-end justify-center"
        panelClassName="w-full bg-white rounded-t-3xl shadow-2xl shadow-spaceCadet-900/30 max-h-[85vh] overflow-y-auto pb-safe"
        maxHeightVh={85}
        overlayAnimation={{ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }}
        panelAnimation={{
          initial: { y: '100%' },
          animate: { y: 0 },
          exit: { y: '100%' },
          transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
        }}
      >
        <div className="px-5 pt-3 pb-4">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-lavender-200" aria-hidden="true" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-spaceCadet-900">Filters</h2>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="Close filters"
              className="w-11 h-11 rounded-2xl border border-lavender-200 flex items-center justify-center text-heliotrope-500 hover:bg-lavender-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">{filterControls(true)}</div>
          <button type="button" onClick={() => setFiltersOpen(false)} className={`${BTN_PRIMARY} w-full mt-6`}>
            Show results
          </button>
        </div>
      </Sheet>

      {tab === 'look' ? (
        <LookPanel
          view={lookView}
          shortlist={shortlist}
          busy={enquiry.busy}
          onToggle={toggleShortlist}
          onEnquire={enquireOne}
          onRetry={() => setNonce((n) => n + 1)}
          onBack={() => setTab('foryou')}
        />
      ) : (
        <Results
          view={view}
          tab={tab}
          page={page}
          onPage={goToPage}
          onRetry={() => setNonce((n) => n + 1)}
          shortlist={shortlist}
          busy={enquiry.busy}
          onToggle={toggleShortlist}
          onEnquire={enquireOne}
          onLook={openLook}
        />
      )}
      {/* Room so the sticky bar never covers the pager. */}
      {groups.length > 0 && <div className="h-48" aria-hidden="true" />}
      <ShortlistBar
        groups={groups}
        enquiry={enquiry}
        onRemove={(id) => updateShortlist(shortlist.filter((i) => i.id !== id))}
        onLook={openLook}
      />
      {analyzeMode && (
        <AnalyzeSheet
          mode={analyzeMode}
          onClose={() => setAnalyzeMode(null)}
          onDone={(garment) => {
            if (garment) {
              setSimilar(garment)
              setPage(1)
            } else setNonce((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

function Results({
  view,
  tab,
  page,
  onPage,
  onRetry,
  shortlist,
  busy,
  onToggle,
  onEnquire,
  onLook,
}: {
  view: View
  tab: FeedTab
  page: number
  onPage: (p: number) => void
  onRetry: () => void
  shortlist: ShortItem[]
  busy: boolean
  onToggle: (c: FeedCard) => void
  onEnquire: (c: FeedCard) => void
  onLook: (id: string) => void
}) {
  if (view.kind === 'loading') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }
  if (view.kind === 'unauthorized') {
    return (
      <Notice icon={UserRound}>
        <p>
          Your session ended. <Link href={LOGIN_HREF} className="text-fuchsia-600 font-semibold underline">Please log in</Link> to see your feed.
        </p>
      </Notice>
    )
  }
  if (view.kind === 'error') {
    return (
      <Notice
        icon={AlertCircle}
        action={<button type="button" onClick={onRetry} className={BTN_SECONDARY}>Try again</button>}
      >
        <p>We could not load your feed.</p>
      </Notice>
    )
  }

  const { data, meta } = view
  if (data.length === 0) {
    return (
      <Notice icon={SearchX}>
        <p>
          {tab === 'festival'
            ? 'No festival pieces near you yet. Try a wider distance.'
            : tab === 'trending'
              ? 'Nothing trending near you right now. Try a wider distance.'
              : 'No matches yet. Try a wider budget or distance, or take the quick quiz.'}
        </p>
      </Notice>
    )
  }
  const pages = Math.ceil(meta.total / meta.limit)

  return (
    <div className="space-y-4">
      {meta.location_scope === 'nationwide' && (
        <p className="text-xs text-heliotrope-500 px-1 flex items-start gap-1.5">
          <Globe2 aria-hidden className="h-3.5 w-3.5 mt-px shrink-0" />
          Showing stores from all of India. Tap Near me to see nearby stores first.
        </p>
      )}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {data.map((c) => (
          <StyleCard
            key={c.id}
            card={c}
            saved={shortlist.some((i) => i.id === c.id)}
            full={shortlist.filter((i) => i.slug === c.retailer.slug).length >= MAX_PER_STORE}
            busy={busy}
            onToggle={() => onToggle(c)}
            onEnquire={() => onEnquire(c)}
            onLook={() => onLook(c.id)}
          />
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={`${BTN_SECONDARY} px-4`}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
            Prev
          </button>
          <span className="text-xs font-semibold text-heliotrope-500 tabular-nums">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={`${BTN_SECONDARY} px-4`}>
            Next
            <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
