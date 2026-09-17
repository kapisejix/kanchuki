// Task 18a: Cross-store shopper shell — layout + require-passport guard.
//
// All pages under (shopper)/ require an authenticated passport session.
// Unauthenticated visitors are redirected to /login with a return_to query
// parameter naming the page they were trying to reach, so they can complete
// OTP and land back where they were going.
//
// /login (not /) is the destination because / is the retailer-facing marketing
// page and has no customer login surface — an installed-PWA launch (start_url
// → /my-stores) had nowhere to complete login.

'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getPassportSession } from '@/lib/passport-client'
import { RETURN_TO_PARAM, sanitizeReturnTo } from '@/lib/return-to'

interface PassportAccount {
  id: string
  name: string | null
  phone_masked: string
  usual_size: string | null
  city: string | null
}

export default function ShopperLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [account, setAccount] = useState<PassportAccount | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // The query string is carried too, so a shopper intercepted on
    // `/my-stores?tab=orders` returns to that exact URL rather than to the bare
    // path. Read from `window.location` rather than `useSearchParams()`: this
    // runs in an effect, so it is browser-only by definition, and
    // `useSearchParams()` in a layout with no Suspense boundary would force
    // every guarded route out of static rendering.
    const wanted = `${pathname}${window.location.search}`

    // Pathname is same-origin by construction, but it is still the value that
    // becomes a post-login navigation target, so it goes through the same
    // validator — a bad value can never be written into the URL. The validator
    // keeps a query string but refuses anything that leaves the origin.
    const loginUrl = `/login?${RETURN_TO_PARAM}=${encodeURIComponent(sanitizeReturnTo(wanted))}`

    getPassportSession()
      .then((session) => {
        if (!session) {
          // Not signed in — log in first, then come back to this page.
          router.replace(loginUrl)
          return
        }
        setAccount(session)
        setLoading(false)
      })
      .catch(() => {
        router.replace(loginUrl)
      })
  }, [router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto mb-4" />
          <p className="text-stone-500 text-sm">Loading your profile…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Shopper nav bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40 pt-safe">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold text-stone-900 text-lg">
            Kanchuki
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/my-profile"
              className={`text-stone-600 hover:text-stone-900 transition-colors ${
                pathname === '/my-profile' ? 'text-amber-600 font-medium' : ''
              }`}
            >
              My Profile
            </Link>
            <Link
              href="/my-stores"
              className={`text-stone-600 hover:text-stone-900 transition-colors ${
                pathname === '/my-stores' ? 'text-amber-600 font-medium' : ''
              }`}
            >
              My Stores
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
