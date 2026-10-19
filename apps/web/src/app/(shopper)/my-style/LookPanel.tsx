// F-045 PR-10b: the "Complete the look" tab body. Honest empty states: an unmapped garment or
// an empty neighbourhood says so, it is never padded with unrelated pieces (RC-059).
'use client'

import Link from 'next/link'
import { StyleCard } from './StyleCard'
import { LOGIN_HREF, type FeedCard, type LookResult } from './lib'
import { MAX_PER_STORE, type ShortItem } from './shortlist'

export type LookView = { kind: 'loading' } | LookResult

interface Props {
  view: LookView
  shortlist: ShortItem[]
  busy: boolean
  onToggle: (c: FeedCard) => void
  onEnquire: (c: FeedCard) => void
  onRetry: () => void
  onBack: () => void
}

export function LookPanel({ view, shortlist, busy, onToggle, onEnquire, onRetry, onBack }: Props) {
  if (view.kind === 'loading') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="aspect-[3/4] bg-stone-200 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (view.kind === 'unauthorized') {
    return (
      <p className="text-center py-10 text-stone-500">
        Your session ended. <Link href={LOGIN_HREF} className="text-amber-700 font-medium">Please log in</Link> to continue.
      </p>
    )
  }
  if (view.kind === 'unavailable') {
    return (
      <div className="text-center py-10">
        <p className="text-stone-500 text-sm">That piece is no longer available.</p>
        <button type="button" onClick={onBack} className="mt-2 text-sm font-medium text-amber-700">
          Back to your feed
        </button>
      </div>
    )
  }
  if (view.kind === 'error') {
    return (
      <div className="text-center py-10">
        <p className="text-stone-500 text-sm">We could not load this look.</p>
        <button type="button" onClick={onRetry} className="mt-2 text-sm font-medium text-amber-700">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-700">
        Goes with: <span className="font-medium">{view.anchor.name ?? 'this piece'}</span>
      </p>
      {view.slots.length === 0 && (
        <p className="text-center py-10 text-stone-500 text-sm">
          Nothing near you goes with this piece yet. Try a wider distance.
        </p>
      )}
      {view.slots.map((slot) => (
        <section key={slot.key} aria-label={slot.label} className="space-y-2">
          <h2 className="text-sm font-semibold text-stone-900">{slot.label}</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {slot.items.map((c) => (
              <StyleCard
                key={c.id}
                card={c}
                saved={shortlist.some((i) => i.id === c.id)}
                full={shortlist.filter((i) => i.slug === c.retailer.slug).length >= MAX_PER_STORE}
                busy={busy}
                onToggle={() => onToggle(c)}
                onEnquire={() => onEnquire(c)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
