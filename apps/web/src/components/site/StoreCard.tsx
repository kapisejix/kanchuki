'use client'

import { MapPin, Share2, Star } from 'lucide-react'
import Link from 'next/link'
import { SEGMENT_LABEL, type StoreCardData } from '@/lib/nearby-stores'
import StoreLogo from './StoreLogo'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app'

function formatDistance(km: number): string {
  return km < 1 ? `${Math.max(100, Math.round(km * 10) * 100)} m` : `${km} km`
}

// Shared store card — /stores directory and the homepage teaser.
export default function StoreCard({ store }: { store: StoreCardData }) {
  const url = `${SITE_URL}/${store.public_slug}`
  const place = [store.address, store.city].filter(Boolean).join(', ') || 'India'

  const share = async () => {
    const text = `${store.shop_name} — browse their catalog on Kanchuki`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: store.shop_name, text, url })
      } catch {
        // AbortError = the shopper closed the share sheet. Not an error (RC-014).
      }
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <article className="flex overflow-hidden rounded-2xl border border-carbon/10 bg-white shadow-sm">
      <div className="w-28 sm:w-36 shrink-0 self-stretch bg-carbon/5">
        <StoreLogo shopName={store.shop_name} logoUrl={store.logo_url} />
      </div>

      <div className="min-w-0 flex-1 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base sm:text-lg font-semibold text-carbon leading-snug">
            <Link href={`/${store.public_slug}`} className="hover:text-cobalt-600 transition-colors">
              {store.shop_name}
            </Link>
          </h3>
          <button
            type="button"
            onClick={() => void share()}
            aria-label={`Share ${store.shop_name}`}
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-carbon/60 hover:bg-carbon/5 hover:text-carbon transition"
          >
            <Share2 size={18} strokeWidth={1.75} />
          </button>
        </div>

        <p className="mt-0.5 flex items-start gap-1.5 text-sm text-carbon/70">
          <MapPin size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-carbon/50" />
          <span className="min-w-0">
            {store.distance_km !== null && (
              <strong className="font-semibold text-carbon">{formatDistance(store.distance_km)} · </strong>
            )}
            {place}
          </span>
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {store.is_featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2 py-0.5 text-[11px] font-semibold text-carbon">
              <Star size={11} strokeWidth={1.5} className="fill-carbon text-carbon" />
              Featured
            </span>
          )}
          {store.store_types.map((t) => (
            <span key={t} className="rounded-full bg-cobalt-600/10 px-2.5 py-0.5 text-xs font-medium text-cobalt-700">
              {SEGMENT_LABEL[t] ?? t}
            </span>
          ))}
        </div>

        <Link
          href={`/${store.public_slug}`}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-volt px-4 text-sm font-semibold text-carbon hover:bg-volt-600 transition active:scale-[0.98]"
        >
          View Catalog
        </Link>
      </div>
    </article>
  )
}
