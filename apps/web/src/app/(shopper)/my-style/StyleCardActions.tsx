// F-045 PR-5b: every card action goes through here (today: Shortlist + Enquire). A future
// purchase action is one more button in this component (spec §5 seam 1) — nothing is built
// for it now.
'use client'

import type { FeedCard } from './lib'

interface Props {
  card: FeedCard
  saved: boolean
  /** The store already has the maximum number of shortlisted pieces. */
  full: boolean
  busy: boolean
  onToggle: () => void
  onEnquire: () => void
}

export function StyleCardActions({ card, saved, full, busy, onToggle, onEnquire }: Props) {
  if (!card.retailer.slug) return null
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        aria-pressed={saved}
        disabled={!saved && full}
        onClick={onToggle}
        className={`flex-1 rounded-lg border py-2 text-sm disabled:opacity-40 ${
          saved ? 'border-amber-700 text-amber-700' : 'border-stone-300 text-stone-700'
        }`}
      >
        {saved ? 'Shortlisted' : 'Shortlist'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onEnquire}
        className="enquire flex-1 rounded-lg bg-stone-900 py-2 text-sm text-white disabled:opacity-60"
      >
        Enquire
      </button>
    </div>
  )
}
