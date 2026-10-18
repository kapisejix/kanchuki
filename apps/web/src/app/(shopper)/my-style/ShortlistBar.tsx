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
import Link from 'next/link'
import { useRef, useState } from 'react'
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
}

export function ShortlistBar({ groups, enquiry, onRemove }: Props) {
  const { busy, results, send } = enquiry
  if (groups.length === 0) return null
  const n = groups.length

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white p-3 shadow-lg">
      <div className="mx-auto max-w-3xl space-y-2">
        <ul className="max-h-40 space-y-2 overflow-y-auto">
          {groups.map((g) => {
            const r = results[g.slug]
            return (
              <li key={g.slug} className="text-sm">
                <p className="font-medium text-stone-900">
                  {g.shop_name} · {g.items.length} {g.items.length === 1 ? 'piece' : 'pieces'}
                </p>
                <ul className="flex flex-wrap gap-1 text-xs text-stone-600">
                  {g.items.map((i) => (
                    <li key={i.id} className="rounded-full bg-stone-100 px-2 py-0.5">
                      {i.name ?? 'Piece'}{' '}
                      <button
                        type="button"
                        aria-label={`Remove ${i.name ?? 'piece'}`}
                        onClick={() => onRemove(i.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                {r?.kind === 'ok' && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-medium text-green-700"
                  >
                    Open WhatsApp — {g.shop_name}
                  </a>
                )}
                {r?.kind === 'unauthorized' && (
                  <Link href={LOGIN_HREF} className="mt-1 inline-block font-medium text-amber-700">
                    Your session ended. Please log in
                  </Link>
                )}
                {r?.kind === 'error' && (
                  <p className="mt-1 text-red-700">
                    Could not reach {g.shop_name}.{' '}
                    <button type="button" className="underline" disabled={busy} onClick={() => void send([g])}>
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
          className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Sending…' : `Enquire at ${n} ${n === 1 ? 'store' : 'stores'}`}
        </button>
        <p className="text-center text-xs text-stone-500">
          Ask the store if these pieces are available.
        </p>
      </div>
    </div>
  )
}
