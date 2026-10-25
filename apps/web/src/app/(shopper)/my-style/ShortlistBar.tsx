// F-045 PR-5b: the sticky "Enquire at N stores" bar and the send logic behind it.
//
// One POST per store (all that store's picks together), sent one after another. Browsers
// allow a single window.open per tap and block one made after an await in a _blank tab, so:
// exactly one store opens its WhatsApp straight away (same-tab, as the storefront does);
// several stores each get an "Open WhatsApp" link to tap. A store that fails shows an honest
// error with a retry — the feed carries no store phone, so there is no client-built fallback
// link to offer.
'use client'

import { RETURN_TO_PARAM } from '@/lib/return-to'
import { Loader2, MessageCircle, Sparkles, Store, X } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { BTN_PRIMARY } from '../ui'
import { type EnquiryResult, sendEnquiry } from './lib'
import type { StoreGroup } from './shortlist'

const LOGIN_HREF = `/login?${RETURN_TO_PARAM}=${encodeURIComponent('/my-style')}`

export function useEnquiry() {
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Record<string, EnquiryResult>>({})
  const sending = useRef(false) // sync guard: state commits too late for a double tap (RC-015)

  async function send(groups: StoreGroup[]) {
    if (sending.current || groups.length === 0) return
    sending.current = true
    setBusy(true)
    try {
      const out: Record<string, EnquiryResult> = {}
      for (const g of groups) out[g.slug] = await sendEnquiry(g.slug, g.items.map((i) => i.id))
      setResults((prev) => ({ ...prev, ...out }))
      const only = groups.length === 1 ? out[groups[0]?.slug ?? ''] : undefined
      if (only?.kind === 'ok') window.open(only.url, '_self')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return { busy, results, send }
}

interface Props {
  groups: StoreGroup[]
  enquiry: ReturnType<typeof useEnquiry>
  onRemove: (id: string) => void
  /** Complete the look from a shortlisted piece (PR-10b). */
  onLook?: (id: string) => void
}

export function ShortlistBar({ groups, enquiry, onRemove, onLook }: Props) {
  const { busy, results, send } = enquiry
  if (groups.length === 0) return null
  const n = groups.length

  // Chip icon buttons are 28px painted; the ::before pad grows the hit area to 44px.
  const chipBtn =
    'relative h-7 w-7 shrink-0 rounded-full flex items-center justify-center before:absolute before:-inset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50'

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 pb-safe rounded-t-3xl border-t border-lavender-200 bg-white/95 backdrop-blur-xl shadow-[0_-8px_30px_-12px_rgba(35,31,72,0.25)]">
      <div className="mx-auto max-w-4xl px-4 pt-3 space-y-3">
        <ul className="max-h-40 space-y-3 overflow-y-auto">
          {groups.map((g) => {
            const r = results[g.slug]
            return (
              <li key={g.slug} className="text-sm">
                <p className="flex items-center gap-1.5 font-bold text-spaceCadet-900">
                  <Store aria-hidden className="h-4 w-4 text-heliotrope-500" />
                  {g.shop_name} · {g.items.length} {g.items.length === 1 ? 'piece' : 'pieces'}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-2 text-xs">
                  {g.items.map((i) => (
                    <li
                      key={i.id}
                      className="max-w-full inline-flex items-center gap-1 rounded-full bg-lavender-100 pl-3 pr-1 py-0.5 font-semibold text-spaceCadet-900"
                    >
                      <span className="truncate">{i.name ?? 'Piece'}</span>
                      {onLook && (
                        <button
                          type="button"
                          className={`${chipBtn} text-fuchsia-600 hover:bg-fuchsia-500/15`}
                          aria-label={`Complete the look for ${i.name ?? 'piece'}`}
                          title="Complete the look"
                          onClick={() => onLook(i.id)}
                        >
                          <Sparkles aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${chipBtn} text-heliotrope-500 hover:bg-white`}
                        aria-label={`Remove ${i.name ?? 'piece'}`}
                        onClick={() => onRemove(i.id)}
                      >
                        <X aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                {r?.kind === 'ok' && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 min-h-11 inline-flex items-center gap-1.5 font-semibold text-green-700 focus-visible:outline-none focus-visible:underline"
                  >
                    <MessageCircle aria-hidden className="h-4 w-4" />
                    Open WhatsApp — {g.shop_name}
                  </a>
                )}
                {r?.kind === 'unauthorized' && (
                  <Link href={LOGIN_HREF} className="mt-1.5 min-h-11 inline-flex items-center font-semibold text-fuchsia-600">
                    Your session ended. Please log in
                  </Link>
                )}
                {r?.kind === 'error' && (
                  <p className="mt-1.5 text-red-700">
                    Could not reach {g.shop_name}.{' '}
                    <button type="button" className="min-h-11 font-semibold underline" disabled={busy} onClick={() => void send([g])}>
                      Try again
                    </button>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send(groups)}
          className={`${BTN_PRIMARY} w-full`}
        >
          {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {busy ? 'Sending…' : `Enquire at ${n} ${n === 1 ? 'store' : 'stores'}`}
        </button>
        <p className="text-center text-xs text-heliotrope-500 pb-1">
          Ask the store if these pieces are available.
        </p>
      </div>
    </div>
  )
}
