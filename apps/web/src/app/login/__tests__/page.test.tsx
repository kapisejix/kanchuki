// The /login server page is the other end of the contract the (shopper) guard
// writes: it turns `?return_to=` into the prop the form eventually navigates
// to, so an attacker-supplied value must not survive this step.
//
// The sanitizer's rules are covered exhaustively in lib/__tests__/return-to
// .test.ts — what is asserted here is that the page actually calls it, and that
// a hostile value is never handed to the client in the first place.
import { describe, expect, it } from 'vitest'
import { DEFAULT_RETURN_TO } from '@/lib/return-to'
import LoginPage, { metadata } from '../page'

async function returnToFor(searchParams: {
  return_to?: string | string[]
}): Promise<string> {
  const element = (await LoginPage({ searchParams: Promise.resolve(searchParams) })) as unknown as {
    props: { returnTo: string }
  }
  return element.props.returnTo
}

describe('/login page', () => {
  it('passes the requested page through to the form', async () => {
    expect(await returnToFor({ return_to: '/my-stores' })).toBe('/my-stores')
  })

  it('passes a deep path with a query string through', async () => {
    expect(await returnToFor({ return_to: '/my-profile?tab=orders' })).toBe(
      '/my-profile?tab=orders',
    )
  })

  it('decodes the value the guard wrote with encodeURIComponent', async () => {
    expect(await returnToFor({ return_to: encodeURIComponent('/my-stores') })).toBe('/my-stores')
  })

  it('falls back when no target is supplied', async () => {
    expect(await returnToFor({})).toBe(DEFAULT_RETURN_TO)
  })

  it.each([
    ['//evil.example'],
    ['https://evil.example/phish'],
    ['/%5Cevil.example'],
    ['javascript:alert(1)'],
    ['%2F%2Fevil.example'],
  ])('never hands the client the hostile target %s', async (hostile) => {
    expect(await returnToFor({ return_to: hostile })).toBe(DEFAULT_RETURN_TO)
  })

  it('falls back for a repeated parameter (array)', async () => {
    expect(await returnToFor({ return_to: ['/my-stores', '//evil.example'] })).toBe(
      DEFAULT_RETURN_TO,
    )
  })

  it('is noindex — a login form has nothing to rank for', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
