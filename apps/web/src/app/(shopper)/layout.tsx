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

'use client';

import { getPassportSession } from '@/lib/passport-client';
import { RETURN_TO_PARAM, sanitizeReturnTo } from '@/lib/return-to';
import { MotionConfig } from 'framer-motion';
import { Sparkles, Store, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface PassportAccount {
  id: string;
  name: string | null;
  phone_masked: string;
  usual_size: string | null;
  city: string | null;
}

export default function ShopperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [account, setAccount] = useState<PassportAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The query string is carried too, so a shopper intercepted on
    // `/my-stores?tab=orders` returns to that exact URL rather than to the bare
    // path. Read from `window.location` rather than `useSearchParams()`: this
    // runs in an effect, so it is browser-only by definition, and
    // `useSearchParams()` in a layout with no Suspense boundary would force
    // every guarded route out of static rendering.
    const wanted = `${pathname}${window.location.search}`;

    // Pathname is same-origin by construction, but it is still the value that
    // becomes a post-login navigation target, so it goes through the same
    // validator — a bad value can never be written into the URL. The validator
    // keeps a query string but refuses anything that leaves the origin.
    const loginUrl = `/login?${RETURN_TO_PARAM}=${encodeURIComponent(sanitizeReturnTo(wanted))}`;

    getPassportSession()
      .then((session) => {
        if (!session) {
          // Not signed in — log in first, then come back to this page.
          router.replace(loginUrl);
          return;
        }
        setAccount(session);
        setLoading(false);
      })
      .catch(() => {
        router.replace(loginUrl);
      });
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-lavender-50">
        <div className="text-center">
          <div className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-2 border-lavender-200 border-t-fuchsia-600 mx-auto mb-4" />
          <p className="text-heliotrope-500 text-sm">Loading your profile…</p>
        </div>
      </div>
    );
  }

  return (
    // Royal Orchid palette — the retailer mobile app's (lavender surfaces,
    // spaceCadet text, heliotrope secondary, fuchsia accent), owner pick 2026-10-25.
    // reducedMotion="user": every framer-motion entrance below this shell
    // goes still under prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-lavender-50">
        <header className="bg-white/80 backdrop-blur-xl border-b border-lavender-200/80 sticky top-0 z-40 pt-safe">
          <div className="max-w-4xl mx-auto px-4 sm:h-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 sm:py-0">
            <Link
              href="/"
              className="flex items-center self-start sm:self-auto"
              aria-label="Kanchuki — home"
            >
              {/* Official wordmark (same asset as the site Chrome), 884×176 source, 5:1. */}
              <Image
                src="/kanchuki-logo.png"
                alt="Kanchuki"
                width={884}
                height={176}
                priority
                className="h-7 w-auto rounded-md"
              />
            </Link>
            {/* Segmented control: full-width thirds on a phone, inline from sm. */}
            <nav className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-lavender-100 text-sm">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`min-h-11 px-2 sm:px-3 flex items-center justify-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50 ${
                      active
                        ? 'bg-white text-spaceCadet-900 shadow-sm shadow-spaceCadet-900/10'
                        : 'text-heliotrope-500 hover:text-spaceCadet-900'
                    }`}
                  >
                    <Icon
                      aria-hidden
                      className={`h-4 w-4 shrink-0 ${active ? 'text-fuchsia-600' : ''}`}
                    />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
      </div>
    </MotionConfig>
  );
}

const NAV = [
  { href: '/my-style', label: 'My Style', icon: Sparkles },
  { href: '/my-profile', label: 'My Profile', icon: UserRound },
  { href: '/my-stores', label: 'My Stores', icon: Store },
] as const;
