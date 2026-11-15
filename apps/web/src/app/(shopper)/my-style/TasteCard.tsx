// "Your style": what the quick quiz saved, shown back so the shopper can see why the feed
// leans the way it does. Rendered from `meta.taste` (the account's own columns), never from
// local state, so it survives a reload and cannot disagree with the ranking.
'use client'

import { formatPriceRange } from '@kanchuki/shared'
import { SlidersHorizontal } from 'lucide-react'
import { BTN_TEXT, CARD, IconTile } from '../ui'
import type { TasteSummary } from './lib'

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function TasteCard({ taste, onChange }: { taste: TasteSummary; onChange: () => void }) {
  const rows = (
    [
      ['Colours', taste.colors.map(cap)],
      ['Occasions', taste.occasions.map(cap)],
      ['Fabrics', taste.fabrics.map(cap)],
      ['Budget', taste.budget_max ? [`Up to ${formatPriceRange(taste.budget_max, null).replace('/-', '')}`] : []],
    ] as [string, string[]][]
  ).filter(([, v]) => v.length > 0)

  return (
    <section className={`${CARD} p-4`} aria-label="Your style">
      <div className="flex items-start gap-3">
        <IconTile icon={SlidersHorizontal} />
        <div className="min-w-0 flex-1 pt-1.5">
          <h2 className="text-base font-bold text-spaceCadet-900">Your style</h2>
          <p className="text-xs text-heliotrope-500 mt-0.5">Pieces matching these come first in your feed.</p>
        </div>
        <button type="button" onClick={onChange} className={`${BTN_TEXT} shrink-0 -my-1`}>
          Change
        </button>
      </div>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, values]) => (
          <div key={label} className="flex items-start gap-2">
            <dt className="w-20 shrink-0 pt-1 text-xs font-semibold text-heliotrope-500">{label}</dt>
            <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {values.map((v) => (
                <span key={v} className="rounded-full bg-lavender-100 px-2.5 py-1 text-xs font-semibold text-spaceCadet-900">
                  {v}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
