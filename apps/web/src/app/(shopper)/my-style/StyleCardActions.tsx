// F-045 PR-5b: every card action goes through here (today: Shortlist + Enquire). A future
// purchase action is one more button in this component (spec §5 seam 1) — nothing is built
// for it now.
'use client'

import { Heart, MessageCircle, Sparkles } from 'lucide-react'
import type { FeedCard } from './lib'

interface Props {
  card: FeedCard
  saved: boolean
  /** The store already has the maximum number of shortlisted pieces. */
  full: boolean
  busy: boolean
  onToggle: () => void
  onEnquire: () => void
  /** Complete the look (PR-10b). Absent = no button (e.g. already inside that tab). */
  onLook?: () => void
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50'

export function StyleCardActions({ card, saved, full, busy, onToggle, onEnquire, onLook }: Props) {
  if (!card.retailer.slug) return null
  return (
    <div className="mt-3">
      {/* A two-column grid card is ~158px wide at 360px, so Shortlist is a
          44px heart (its name stays the visible-text "Shortlist" for AT) and
          Enquire takes the rest. */}
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={saved}
          disabled={!saved && full}
          onClick={onToggle}
          title={!saved && full ? 'This store already has the most shortlisted pieces' : undefined}
          className={`h-11 w-11 shrink-0 rounded-2xl border flex items-center justify-center transition-colors disabled:opacity-40 ${FOCUS} ${
            saved
              ? 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-600'
              : 'bg-white border-lavender-200 text-heliotrope-500 hover:border-heliotrope-400'
          }`}
        >
          <Heart aria-hidden className={`h-[18px] w-[18px] ${saved ? 'fill-current' : ''}`} />
          <span className="sr-only">{saved ? 'Shortlisted' : 'Shortlist'}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEnquire}
          className={`enquire flex-1 min-w-0 h-11 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-spaceCadet-900 to-tyrian-800 text-white text-sm font-semibold shadow-md shadow-spaceCadet-900/20 transition-opacity hover:opacity-95 disabled:opacity-50 ${FOCUS} focus-visible:ring-offset-2`}
        >
          <MessageCircle aria-hidden className="h-4 w-4 shrink-0" />
          Enquire
        </button>
      </div>
      {onLook && (
        // A real outlined button, one line (nowrap), 44px target. Two rows in all: the
        // primary pair on top, this secondary action under it.
        <button
          type="button"
          onClick={onLook}
          className={`mt-2 h-11 w-full px-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-lavender-200 bg-lavender-50 text-xs font-semibold text-spaceCadet-900 transition-colors hover:bg-lavender-100 ${FOCUS}`}
        >
          <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0 text-fuchsia-600" />
          Complete the look
        </button>
      )}
    </div>
  )
}
