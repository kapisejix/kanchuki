import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'
import { sanitizeReturnTo } from '@/lib/return-to'

// Customer login — where the (shopper) guard sends a visitor who is not
// signed in, carrying the page they were trying to reach as `return_to`.
//
// This exists as its own route rather than as a form on `/` because `/` is the
// retailer-facing marketing page; customer auth there would change that page's
// job and leave an installed-PWA launch with nowhere sensible to log in.
//
// robots: noindex — a login form has nothing to rank for, and the page is
// meaningless without a session to establish.
export const metadata: Metadata = {
  title: 'Log in — Kanchuki',
  robots: { index: false, follow: false },
}

interface Props {
  searchParams?: Promise<{ return_to?: string | string[] }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {}

  // Sanitised on the server so the client never receives a hostile target at
  // all. LoginForm validates again before navigating — the redirect is the
  // boundary that matters, so it does not rely on this call having happened.
  const returnTo = sanitizeReturnTo(params.return_to)

  return <LoginForm returnTo={returnTo} />
}
