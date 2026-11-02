// F-045 PR-10b: the "Complete the look" tab body. Honest empty states: an unmapped garment or
// an empty neighbourhood says so, it is never padded with unrelated pieces (RC-059).
'use client'

import { AlertCircle, PackageX, Sparkles, UserRound } from 'lucide-react'
import Link from 'next/link'
import { ReportAiContent } from '@/components/ReportAiContent'
import { BTN_SECONDARY, CARD, Notice, SKELETON } from '../ui'
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
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }
  if (view.kind === 'unauthorized') {
    return (
      <Notice icon={UserRound}>
        <p>
          Your session ended. <Link href={LOGIN_HREF} className="text-fuchsia-600 font-semibold underline">Please log in</Link> to continue.
        </p>
      </Notice>
    )
  }
  if (view.kind === 'unavailable') {
    return (
      <Notice
        icon={PackageX}
        action={<button type="button" onClick={onBack} className={BTN_SECONDARY}>Back to your feed</button>}
      >
        <p>That piece is no longer available.</p>
      </Notice>
    )
  }
  if (view.kind === 'error') {
    return (
      <Notice
        icon={AlertCircle}
        action={<button type="button" onClick={onRetry} className={BTN_SECONDARY}>Try again</button>}
      >
        <p>We could not load this look.</p>
      </Notice>
    )
  }

  return (
    <div className="space-y-6">
      <p className={`${CARD} px-4 py-3 text-sm text-heliotrope-500 flex items-center gap-2`}>
        <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-fuchsia-600" />
        <span className="min-w-0">
          Goes with: <span className="font-semibold text-spaceCadet-900">{view.anchor.name ?? 'this piece'}</span>
        </span>
      </p>
      {view.slots.length === 0 && (
        <Notice icon={Sparkles}>
          <p>Nothing near you goes with this piece yet. Try a wider distance.</p>
        </Notice>
      )}
      {view.slots.map((slot) => (
        <section key={slot.key} aria-label={slot.label} className="space-y-3">
          <h2 className="text-base font-bold text-spaceCadet-900 px-1">{slot.label}</h2>
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
      {view.slots.length > 0 && <ReportAiContent feature="My Style complete the look" />}
    </div>
  )
}

/** Same shape as a StyleCard, so the grid does not jump when results land. */
export function CardSkeleton() {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className={`aspect-[3/4] ${SKELETON}`} />
      <div className="p-3 space-y-2">
        <div className={`h-3.5 w-3/4 rounded-full ${SKELETON}`} />
        <div className={`h-4 w-1/2 rounded-full ${SKELETON}`} />
        <div className={`h-11 rounded-2xl ${SKELETON}`} />
      </div>
    </div>
  )
}
