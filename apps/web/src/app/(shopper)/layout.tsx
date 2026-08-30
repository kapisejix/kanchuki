// Task 18a: Cross-store shopper shell — layout + require-passport guard.
//
// All pages under (shopper)/ require an authenticated passport session.
// Unauthenticated visitors are redirected to the home page with a
// return_to query parameter so they can complete OTP and come back.

'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getPassportSession } from '@/lib/passport-client'

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
    getPassportSession()
      .then((session) => {
        if (!session) {
          // Redirect to home with return_to so they can log in and come back
          router.replace(`/?return_to=${encodeURIComponent(pathname)}`)
          return
        }
        setAccount(session)
        setLoading(false)
      })
      .catch(() => {
        router.replace(`/?return_to=${encodeURIComponent(pathname)}`)
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
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40">
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
            <Link
              href="/for-you"
              className={`text-stone-600 hover:text-stone-900 transition-colors ${
                pathname === '/for-you' ? 'text-amber-600 font-medium' : ''
              }`}
            >
              For You
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
