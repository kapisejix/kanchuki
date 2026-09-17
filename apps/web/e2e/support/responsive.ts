import { expect, type Locator, type Page } from '@playwright/test'

// Shared viewport + client-error helpers for the customer specs.
//
// Both of these exist because doing them ad hoc is quietly wrong:
//
//   1. `horizontalOverflow` is *blind* on its own — this site runs Lenis smooth
//      scrolling, whose stylesheet sets `overflow: hidden` in some states, and a
//      clipped container makes `scrollWidth` report nothing while content still
//      spills behind it. A green result therefore proves nothing until the
//      detector has been seen to fire on the page under test. The proof lives in
//      `customer-stores-directory.spec.ts` ("the overflow check can actually
//      fail") and both that test and this helper must keep using the same
//      measurement so the proof keeps covering the check.
//
//   2. `watchClientErrors` catches console.error as well as uncaught exceptions.
//      A page error alone misses React hydration mismatches, Next warnings and
//      rejected fetches — all of which a shopper sees as a broken page, and none
//      of which fail a test that only listens for `pageerror`.

export const PHONE = { name: 'phone', width: 390, height: 844 } as const
export const TABLET = { name: 'tablet', width: 820, height: 1180 } as const

/** The sizes the storefront is actually used at: a phone, and a tablet. */
export const VIEWPORTS = [PHONE, TABLET] as const

/**
 * Chrome logs *any* failed resource fetch as a console error, including ones the
 * app handles deliberately — so "no console errors" is only meaningful once the
 * expected failures are named. Only messages that are themselves resource-load
 * failures qualify (see `RESOURCE_LOAD_FAILURE`), and only on the URLs below, so
 * a genuine exception thrown near the same URL still fails the test.
 */
const IGNORED_RESOURCE_URLS: { url: RegExp; reason: string }[] = [
  {
    // Kept for one specific reason: the browser requests /favicon.ico whether or
    // not the app links one, and a 404 there is Chrome's default behaviour
    // rather than the app's.
    url: /favicon\.ico/,
    reason: 'the browser requests /favicon.ico unconditionally',
  },
  {
    // 401 is the documented answer for "not signed in", not a fault: the
    // passport session probe is *meant* to fail for an anonymous shopper, and
    // the signed-in assertions in the same specs cover the other branch.
    url: /\/api\/passport\/(me|stores)/,
    reason: 'the session probe answers 401 for an anonymous shopper',
  },
]

// Two entries have been deleted from this list, both once the underlying thing
// was genuinely fixed rather than merely tolerated:
//
//   1. The storefront's two dead 404s (`/view`, `/checkout-status`). Fixed in
//      the RC-025 pass — the view proxy routes exist, the checkout probe is
//      gone — so these pages are held to a clean console with no exceptions.
//
//   2. `/cdn-e2e\.r2\.dev|_next/image`, excused as "the fixture photo host the
//      harness does not serve". That entry was hiding more than noise: the
//      optimizer 500'd, so every photo grid was being measured with broken
//      images in it. `support/images.ts` now serves them, `expectRenderedImage`
//      asserts real pixels, and the entry is gone.
//
// Anything added back here should say which of these situations it is, or it
// becomes the place the next bug hides.

/** The message shape Chrome uses for a failed fetch of a resource. */
const RESOURCE_LOAD_FAILURE = /Failed to load resource|net::ERR_|upstream image response failed/

export interface ClientErrors {
  /** Uncaught exceptions — `pageerror`. */
  pageErrors: string[]
  /** `console.error` that isn't a mocked-resource failure. */
  consoleErrors: string[]
  /** What the filter dropped, so a too-broad allowlist is visible in output. */
  ignored: string[]
  /** Both lists empty — what every responsive assertion below ends with. */
  expectClean(where: string): void
}

export function watchClientErrors(page: Page): ClientErrors {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const ignored: string[] = []

  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const url = msg.location()?.url ?? ''
    const text = msg.text()
    const expected = RESOURCE_LOAD_FAILURE.test(text)
      ? IGNORED_RESOURCE_URLS.find((entry) => entry.url.test(url))
      : undefined
    if (expected) {
      ignored.push(`${text} @ ${url} — ${expected.reason}`)
      return
    }
    consoleErrors.push(url ? `${text} @ ${url}` : text)
  })

  return {
    pageErrors,
    consoleErrors,
    ignored,
    expectClean(where: string) {
      // The message carries what was ignored, so a run that starts silently
      // swallowing real errors is diagnosable from the failure alone.
      const detail = ignored.length ? `\n(ignored as mocked-resource noise: ${JSON.stringify(ignored, null, 2)})` : ''
      expect(pageErrors, `uncaught exceptions on ${where}${detail}`).toEqual([])
      expect(consoleErrors, `console errors on ${where}${detail}`).toEqual([])
    },
  }
}

/** Widest scroll extent vs the viewport — >1px means something overflows. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

/**
 * A horizontally scrolling storefront is what a shopper reports as "the site is
 * broken", and a desktop-only test run cannot see it.
 */
export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  expect(await horizontalOverflow(page), `${where} scrolls sideways`).toBeLessThanOrEqual(1)
}

/**
 * The `<img>` actually decoded pixels — not a broken box.
 *
 * This exists because every other visual check in this file passes on a broken
 * image: the element is in the DOM, `toBeVisible()` is true, it occupies its
 * width/height box, and it contributes nothing to `scrollWidth`. So a sizing
 * claim about a photo grid can be measured entirely against failed requests and
 * still come back green. `naturalWidth` is the only honest signal.
 *
 * Polled rather than sampled: the optimizer response lands after first paint
 * (`next/image` sets `src` on hydration, and a lazy tile decodes later), so a
 * one-shot read races the very thing it is measuring.
 */
export async function expectRenderedImage(locator: Locator, where: string): Promise<void> {
  await expect
    .poll(() => locator.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
      message: `${where} never decoded pixels — the <img> box renders but the photo failed to load`,
    })
    .toBeGreaterThan(0)
}

/**
 * Every edge of the element is inside the viewport — the phone-specific failure
 * where a control renders off-screen (a sheet's close button being the classic)
 * and is visible to the test but unreachable to a thumb.
 */
export async function expectFullyInViewport(locator: Locator, where: string): Promise<void> {
  const box = await locator.boundingBox()
  expect(box, `${where} has no layout box`).not.toBeNull()
  const viewport = locator.page().viewportSize()
  expect(viewport, `${where} needs an explicit viewport`).not.toBeNull()
  expect(box!.x, `${where} starts off the left edge`).toBeGreaterThanOrEqual(0)
  expect(box!.y, `${where} starts above the top edge`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${where} runs past the right edge`).toBeLessThanOrEqual(viewport!.width + 1)
  expect(box!.y + box!.height, `${where} runs past the bottom edge`).toBeLessThanOrEqual(viewport!.height + 1)
}
