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

export function StyleCard({ card: c, saved, full, busy, onToggle, onEnquire, onLook }: Props) {
  return (
    <li className={`${CARD} overflow-hidden flex flex-col`}>
      <div className="aspect-[3/4] bg-lavender-100 flex items-center justify-center">
        {c.primary_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote store photo, sized by the grid
          <img src={c.primary_photo_url} alt={c.name ?? 'Product'} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Shirt aria-hidden className="h-8 w-8 text-heliotrope-400" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        {c.retailer.slug ? (
          <Link
            href={`/${c.retailer.slug}/all-${c.retailer.slug}/product/${c.id}`}
            className="text-sm font-semibold text-spaceCadet-900 truncate hover:text-fuchsia-600 focus-visible:outline-none focus-visible:underline"
          >
            {c.name}
          </Link>
        ) : (
          <p className="text-sm font-semibold text-spaceCadet-900 truncate">{c.name}</p>
        )}
        <p className="text-base font-bold text-spaceCadet-900 tabular-nums mt-0.5">{formatPriceRange(c.price_min, c.price_max)}</p>
        <p className="text-xs text-heliotrope-500 truncate mt-0.5">
          {[c.retailer.shop_name, c.retailer.city, c.distance_km != null ? `${c.distance_km} km` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
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
