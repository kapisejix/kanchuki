'use client'

import { UserRound } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getPassportSession, type PassportAccount } from '@/lib/passport-client'

// Customer entry point for the store directory — the one surface on the
// marketing site that is genuinely shopper-facing.
//
// It reflects session state rather than always reading "Log in": a shopper who
// already has a passport sees their own name and a way back to the stores they
// have visited, instead of being invited to log in again.
//
// Deliberately scoped to /stores, not to the shared `Navbar`/`Footer`. Those
// render on every marketing page, and those pages are statically rendered, so a
// session check there would cost *every* marketing page view (including `/`)
// one `/api/passport/me` call — and would put a customer entry point in the
// retailer-facing nav next to "Start Free Trial".
//
// The passport cookie is HttpOnly, so the state cannot be known without asking
// the API. Until the answer arrives this renders an inert placeholder rather
// than "Log in", so a signed-in shopper is never briefly told to sign in.
// 40px, matching the site's other pill controls (`Chrome.tsx`'s "Start Free
// Trial" is `px-5 py-2.5 text-sm`) rather than the 36px this started at, which
// read as undersized next to the 48px search field directly below it.
const PILL_HEIGHT = 'h-10'

export default function ShopperEntry() {
  const [account, setAccount] = useState<PassportAccount | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const session = await getPassportSession()
        if (!cancelled) setAccount(session)
      } catch {
        if (!cancelled) setAccount(null)
      } finally {
        if (!cancelled) setChecked(true)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  // Reserve the row's height so the search box below doesn't jump when the
  // session check lands.
  if (!checked) return <div className={`${PILL_HEIGHT} w-[104px]`} aria-hidden="true" />

  const name = account?.name?.trim() || null

  return (
    <Link
      // Plain /login, not /login?return_to=/stores: this is an explicit "take me
      // to my account" action rather than an interception, and /my-stores is the
      // shopper's home — the same place the installed icon opens.
      href={account ? '/my-stores' : '/login'}
      // focus-visible ring copied from the marketing CTA's pattern (and the
      // search field below uses the same cobalt-500), so the one keyboard-
      // reachable control on this page isn't the only one without a visible
      // focus state.
      className={`inline-flex ${PILL_HEIGHT} items-center gap-2 rounded-full border border-carbon/15 bg-white px-4 text-sm font-medium text-carbon transition hover:border-cobalt-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-500 focus-visible:ring-offset-2 ring-offset-cream`}
    >
      <UserRound size={15} strokeWidth={1.5} className="text-carbon/50" />
      {account ? (
        <>
          {/* `name` is nullable — the passport OTP flow never asks for one. */}
          <span>{name ?? 'My Stores'}</span>
          {name && <span className="text-xs text-carbon/50">· My Stores</span>}
        </>
      ) : (
        <span>Log in</span>
      )}
    </Link>
  )
}
