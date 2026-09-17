import { test, expect } from '@playwright/test'
import type { StoresDirectoryData } from '../src/app/stores/page'
import type { PassportAccount } from '../src/lib/passport-client'
import { API_STUB_ORIGIN, closeStub, createStubServer, json, listenStub } from './support/api-stub'
import {
  VIEWPORTS,
  expectNoHorizontalOverflow,
  horizontalOverflow,
  watchClientErrors,
} from './support/responsive'

// /stores customer entry point — live verification.
//
// Same harness as the other customer specs: real `next start` prod build, real
// Chrome, hermetic stub API on :3001 (see ./support/api-stub.ts — building the
// stub through that helper is what guarantees the CORS header this spec's
// browser-side directory fetch needs). The stub exists because the directory
// page is server-rendered, and because the passport session is HttpOnly — only
// the server can answer "is this visitor signed in?".
//
// ── What this proves that the unit tests cannot ────────────────────
// 1. The entry point renders on the real page (a client component inside a
//    statically-rendered route), not just in jsdom.
// 2. Signing in changes what the real browser shows, and the link is actually
//    clickable to its destination — an href that 404s is the RC-005/RC-006
//    shape this repo has been bitten by twice, and a unit test cannot see it.
// 3. Adding it did not break the directory itself, on a phone or a tablet.
//
// ── Stub payloads are TYPED on purpose ─────────────────────────────
// `DIRECTORY` is annotated with the page's own `StoresDirectoryData` and
// `ACCOUNT` with the client's `PassportAccount`, so a field rename in either
// contract fails `tsc` here instead of leaving this spec green against a shape
// the app no longer accepts (the RC-008 class: the wire contract drifts and the
// test keeps passing because its fixture was written by hand).

const DIRECTORY: StoresDirectoryData = {
  stores: [
    {
      public_slug: 'meera-sarees',
      shop_name: 'Meera Sarees',
      city: 'Jaipur',
      logo_url: null,
      product_count: 12,
      is_featured: true,
    },
  ],
  total: 12,
  page: 1,
  page_size: 12,
  total_pages: 1,
  cities: [{ city: 'Jaipur', count: 1 }],
}

const ACCOUNT: PassportAccount = {
  id: 'customer-1',
  name: 'Ananya Sharma',
  phone_masked: '••••••9999',
  usual_size: 'M',
  city: 'Jaipur',
}

// Enough for the /my-stores page to render a real row after the click-through.
const VISITS = {
  stores: [
    {
      retailer: {
        id: 'retailer-1',
        shop_name: 'Meera Sarees',
        city: 'Jaipur',
        logo_url: null,
        public_slug: 'meera-sarees',
      },
      last_visited_at: new Date(Date.now() - 60_000).toISOString(),
      visit_count: 3,
      is_muted: false,
    },
  ],
}

let apiStub: ReturnType<typeof createStubServer> | null = null
const state = { signedIn: false, requests: [] as string[] }

test.beforeAll(async () => {
  apiStub = createStubServer((req, res) => {
    const url = new URL(req.url ?? '/', API_STUB_ORIGIN)
    const path = url.pathname
    state.requests.push(`${req.method} ${path}`)

    if (path === '/v1/public/passport/me') {
      if (!state.signedIn) {
        json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
        return
      }
      json(res, 200, { account: ACCOUNT })
      return
    }

    if (path === '/v1/public/passport/stores') {
      if (!state.signedIn) {
        json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
        return
      }
      json(res, 200, VISITS)
      return
    }

    // The directory listing itself — fetched by the BROWSER, not by SSR, which
    // is why this stub (unlike the passport specs') must send CORS.
    if (path === '/v1/public/stores' && req.method === 'GET') {
      json(res, 200, { data: DIRECTORY })
      return
    }

    json(res, 404, { error: { code: 'NOT_FOUND', message: `No stub for ${path}` } })
  })

  await listenStub(apiStub)
})

test.afterAll(async () => {
  await closeStub(apiStub)
})

test.beforeEach(async ({ context }) => {
  state.signedIn = false
  state.requests = []
  await context.clearCookies()
})

/**
 * Uncaught page errors and unhandled rejections for one test.
 *
 * RC-014 shipped because a rejection with no handler was invisible in a
 * passing run; a component that throws still renders "something", so the
 * assertions below would pass anyway. Collecting `pageerror` makes it a
 * failure instead.
 */

// ── Entry point state ─────────────────────────────────────────────

test('a signed-out visitor is offered Log in on the directory', async ({ page }) => {
  const client = watchClientErrors(page)
  await page.goto('/stores')

  const entry = page.getByRole('link', { name: /^log in$/i })
  await expect(entry).toBeVisible()
  expect(await entry.getAttribute('href')).toBe('/login')

  // The page around it still works — search box renders, and the directory
  // data arrives from the browser-side fetch (the one that needs CORS).
  await expect(page.getByLabel('Search stores')).toBeVisible()
  await expect(page.getByText('Meera Sarees')).toBeVisible()

  // The session was asked for through the web proxy, not the API origin. This
  // one is already settled: the entry point above cannot render without it.
  expect(state.requests).toContain('GET /v1/public/passport/me')

  // …and the directory was fetched by the browser from the API origin itself —
  // the cross-origin call that needs CORS.
  //
  // POLLED, not sampled, and that is not defensive padding: /stores is
  // `revalidate = 300`, and Next's Data Cache lives on disk
  // (`.next/cache/fetch-cache`), so it survives between runs. On a cache-warm
  // run the server renders the page with no network call at all and the
  // `Meera Sarees` assertion above is satisfied by the *first paint* — while
  // the client's mount fetch is still in flight. Sampling the log there fails
  // intermittently with the card plainly visible, which is exactly what
  // happened once before this was polled. Waiting for the entry is also the
  // stronger claim: the browser really did make the call.
  await expect
    .poll(() => state.requests.join('\n'), {
      message: 'the browser never fetched the directory from the API origin',
      timeout: 15_000,
    })
    .toContain('GET /v1/public/stores')
  client.expectClean('the signed-out directory')
})

test("a signed-in shopper sees their own name there, linking to their stores", async ({ page }) => {
  const client = watchClientErrors(page)
  state.signedIn = true
  await page.goto('/stores')

  const entry = page.getByRole('link', { name: /ananya sharma/i })
  await expect(entry).toBeVisible()
  expect(await entry.getAttribute('href')).toBe('/my-stores')

  // Still not inviting them to log in again.
  expect(await page.getByRole('link', { name: /^log in$/i }).count()).toBe(0)
  client.expectClean('the signed-in directory')
})

// ── The destinations actually work (RC-005/RC-006) ────────────────

test('Log in leads to a login page that can be used', async ({ page }) => {
  const client = watchClientErrors(page)
  await page.goto('/stores')

  await page.getByRole('link', { name: /^log in$/i }).click()

  await page.waitForURL(/\/login/)
  // The destination is a real, usable form — not a 404 or a blank route.
  await expect(page.getByPlaceholder('10-digit mobile number')).toBeVisible()
  client.expectClean('the login page')
})

test('the signed-in link opens the shopper\'s stores page, not a 404', async ({ page }) => {
  const client = watchClientErrors(page)
  state.signedIn = true
  await page.goto('/stores')

  await page.getByRole('link', { name: /ananya sharma/i }).click()

  await page.waitForURL(/\/my-stores/)
  await expect(page.getByRole('heading', { name: 'My Stores' })).toBeVisible()
  // The row comes from the passport API — proof the page really resolved a
  // session rather than rendering an empty shell.
  await expect(page.getByText('Meera Sarees')).toBeVisible()
  client.expectClean('the my-stores page')
})

// ── Phone + tablet ────────────────────────────────────────────────

test('the overflow check can actually fail', async ({ page }) => {
  // A detector nobody has seen fire is not a detector. This page runs Lenis
  // smooth scrolling, whose stylesheet sets `overflow: hidden` in some states —
  // and a clipped container makes `scrollWidth` report nothing while content is
  // still spilling behind it. So: prove the measurement notices a real
  // overflow, on this page, before trusting the green result above.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/stores')
  await expect(page.getByRole('link', { name: /^log in$/i })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'the directory at phone width')

  await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.id = 'overflow-probe'
    probe.style.cssText = 'position:absolute;top:0;left:0;width:2000px;height:1px'
    document.body.appendChild(probe)
  })
  expect(await horizontalOverflow(page)).toBeGreaterThan(1)

  await page.evaluate(() => document.getElementById('overflow-probe')?.remove())
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

for (const vp of VIEWPORTS) {
  test(`the directory and its entry point hold up on ${vp.name} (${vp.width}px)`, async ({
    page,
  }) => {
    const client = watchClientErrors(page)
    // Signed in, so the entry point renders its widest state (name + suffix) —
    // the one that could overflow a narrow row.
    state.signedIn = true
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/stores')

    const entry = page.getByRole('link', { name: /ananya sharma/i })
    await expect(entry).toBeVisible()

    // Nothing may spill past the viewport horizontally. This is the check that
    // catches the layout class of bug that a desktop-only run cannot see.
    await expectNoHorizontalOverflow(page, `the directory on ${vp.name}`)

    // The entry point stays a comfortable tap target rather than shrinking to
    // fit (40px = the site's pill height; sub-24px would fail WCAG 2.2).
    const box = await entry.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(40)

    await expect(page.getByLabel('Search stores')).toBeVisible()
    await expect(page.getByText('Meera Sarees')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /shop real clothing stores on kanchuki/i }),
    ).toBeVisible()
    client.expectClean(`the directory on ${vp.name}`)
  })

  // The other half of the installed-icon flow: an expired session lands here,
  // and it has to be fillable with a thumb — a phone input plus a button that
  // stays on screen and stays tappable is the whole page.
  test(`the login page can be completed on ${vp.name} (${vp.width}px)`, async ({ page }) => {
    const client = watchClientErrors(page)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/login?return_to=%2Fmy-stores')

    const phone = page.getByPlaceholder('10-digit mobile number')
    await expect(phone).toBeVisible()
    await expectNoHorizontalOverflow(page, `the login page on ${vp.name}`)

    // The submit stays disabled until the number *and* the consent tick are
    // there, so filling both is what proves the form can actually be completed
    // on this screen — not merely that it rendered.
    const submit = page.getByRole('button', { name: 'Send OTP' })
    await expect(submit).toBeDisabled()
    await phone.fill('9999999999')
    await page.getByRole('checkbox').first().check()
    await expect(submit).toBeEnabled()

    // The field stays a comfortable size rather than shrinking on a narrow
    // screen — usable without pinch-zoom or sideways scrolling.
    const height = (await phone.boundingBox())!.height
    expect(height, `the phone input on ${vp.name} is ${height}px tall`).toBeGreaterThanOrEqual(40)
    client.expectClean(`the login page on ${vp.name}`)
  })
}
