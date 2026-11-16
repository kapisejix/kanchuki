// F-045: one My Style product card, shared by the feed grid and the Complete-the-look tab.
// Prices are paise and go through the shared formatter (RC-055). No occasion or reason line
// is shown: occasions are a ranking input, never a shopper-facing fact.
'use client'

import { formatPriceRange } from '@kanchuki/shared'
import { Shirt } from 'lucide-react'
import Link from 'next/link'
import { CARD } from '../ui'
import { StyleCardActions } from './StyleCardActions'
import type { FeedCard } from './lib'

interface Props {
  card: FeedCard
  saved: boolean
  full: boolean
  busy: boolean
  onToggle: () => void
  onEnquire: () => void
  onLook?: () => void
}

const NAME = 'block text-sm font-semibold leading-5 text-spaceCadet-900 line-clamp-2 min-h-10'

export function StyleCard({ card: c, saved, full, busy, onToggle, onEnquire, onLook }: Props) {
  return (
    <li className={`${CARD} overflow-hidden flex flex-col`}>
      {/* One fixed 4:5 frame for every card. `overflow-hidden` + an absolutely placed image
          matter: an aspect-ratio box only yields to its content while min-height is auto, so
          without them a tall photo stretched its card far past its row neighbour. */}
      <div className="relative aspect-[4/5] overflow-hidden bg-lavender-100 flex items-center justify-center">
        {c.primary_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote store photo, sized by the grid
          <img src={c.primary_photo_url} alt={c.name ?? 'Product'} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <Shirt aria-hidden className="h-8 w-8 text-heliotrope-400" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        {/* Two lines reserved for the name, so every card's text block is the same height. */}
        {c.retailer.slug ? (
          <Link
            href={`/${c.retailer.slug}/all-${c.retailer.slug}/product/${c.id}`}
            className={`${NAME} hover:text-fuchsia-600 focus-visible:outline-none focus-visible:underline`}
          >
            {c.name}
          </Link>
        ) : (
          <p className={NAME}>{c.name}</p>
        )}
        <p className="text-base font-bold text-spaceCadet-900 tabular-nums mt-1">{formatPriceRange(c.price_min, c.price_max)}</p>
        <p className="text-xs text-heliotrope-500 truncate mt-0.5">
          {[c.retailer.shop_name, c.retailer.city, c.distance_km != null ? `${c.distance_km} km` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {c.suggested_size && (
          <p data-testid="suggested-size" className="text-xs font-semibold text-fuchsia-600 mt-1">
            Your size: {c.suggested_size.size}
            {c.suggested_size.between ? ` (between ${c.suggested_size.between[0]} and ${c.suggested_size.between[1]})` : ''}
            <span className="font-normal text-heliotrope-500"> · approx.</span>
          </p>
        )}
        <div className="mt-auto">
          <StyleCardActions
            card={c}
            saved={saved}
            full={full}
            busy={busy}
            onToggle={onToggle}
            onEnquire={onEnquire}
            onLook={onLook}
          />
        </div>
      </div>
    </li>
  )
}
