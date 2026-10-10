'use client'

import { Crosshair } from 'lucide-react'
import type { useUserLocation } from '@/lib/nearby-stores'

interface Props {
  loc: ReturnType<typeof useUserLocation>
  /** Radius the API settled on (2 → 5 → 10 km); null when no nearby list was shown. */
  radiusKm: number | null
  /** Nearby lookup ran but found nothing within 10 km — the list below is everyone. */
  empty: boolean
}

// "Near me" control + status line shared by /stores and the homepage teaser.
export default function NearMeBar({ loc, radiusKm, empty }: Props) {
  let message: string | null = null
  if (loc.status === 'asking') message = 'Finding your location…'
  else if (loc.status === 'denied') message = 'Location is off — showing all stores. Tap to try again.'
  else if (loc.status === 'granted') {
    if (empty) message = 'No stores within 10 km of you yet — showing all stores.'
    else if (radiusKm === 2) message = 'Showing stores within 2 km of you, nearest first.'
    else if (radiusKm) message = `No stores within 2 km — showing stores within ${radiusKm} km.`
  }

  return (
    <div className="mb-8 flex flex-col items-center gap-2 text-center">
      {loc.status !== 'granted' && (
        <button
          type="button"
          onClick={loc.request}
          disabled={loc.status === 'asking'}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-carbon px-5 text-sm font-semibold text-cream hover:bg-carbon/90 disabled:opacity-60 transition active:scale-[0.97]"
        >
          <Crosshair size={16} strokeWidth={1.75} />
          Show stores near me
        </button>
      )}
      {message && (
        <p role="status" className="text-sm text-carbon/60">
          {message}
        </p>
      )}
    </div>
  )
}
