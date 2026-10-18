import { expect, test } from '@playwright/test'
import type { Server } from 'node:http'
import { MY_STYLE_CONSENT } from '@kanchuki/shared'
import { API_STUB_ORIGIN, closeStub, createStubServer, json, listenStub } from './support/api-stub'
import { watchClientErrors } from './support/responsive'

// F-045 PR-7 - /my-style selfie flow, end to end through the REAL web proxy.
//
// Real: a production `next start` build, real Chrome, the real /api/my-style proxy
// (so the photo's bytes really cross it), real image decode + re-encode in the
// browser. Stubbed (RC-048): the API on :3001, the only thing that cannot run here.
//
// The stub records what reached it, so the multipart round trip is asserted on the
// bytes (PR-7 T12: the old text-body proxy corrupted exactly this).

type Analyze = { query: string; contentType: string; body: Buffer }

type StubState = {
  signedIn: boolean
  /** What the analyze POST answers. */
  analyzeStatus: number
  /** Polls answered "processing" before "ready". */
  processingPolls: number
  profile: null | { undertone: string; depth: string; frame: string }
  analyzed: Analyze[]
  polls: number
  cleared: number
}

const state: StubState = {
  signedIn: true,
  analyzeStatus: 202,
  processingPolls: 1,
  profile: null,
  analyzed: [],
  polls: 0,
  cleared: 0,
}

let apiStub: Server | null = null

// 1x1 PNG: the browser must decode it and send back a JPEG (the API refuses anything else).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function readBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

test.beforeAll(async () => {
  apiStub = createStubServer((req, res) => {
    const url = new URL(req.url ?? '/', API_STUB_ORIGIN)
    const path = url.pathname

    if (path === '/v1/public/passport/me') {
      if (!state.signedIn) {
        json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
        return
      }
      json(res, 200, {
        account: {
          id: 'customer-1',
          name: 'Ananya',
          phone_masked: '••••••9999',
          usual_size: 'M',
          city: 'Jaipur',
        },
      })
      return
    }

    if (req.method === 'POST' && path === '/v1/public/my-style/feed') {
      void readBody(req).then(() =>
        json(res, 200, {
          data: [],
          meta: {
            total: 0,
            page: 1,
            limit: 12,
            sort: 'best',
            location_scope: 'city',
            rationale_source: 'none',
            truncated: false,
            style_profile: state.profile
              ? { ...state.profile, palette: { good: ['maroon', 'teal'], avoid: ['yellow'] } }
              : null,
          },
        }),
      )
      return
    }

    if (req.method === 'POST' && path === '/v1/public/my-style/analyze') {
      void readBody(req).then((body) => {
        state.analyzed.push({
          query: url.search,
          contentType: String(req.headers['content-type'] ?? ''),
          body,
        })
        if (state.analyzeStatus !== 202) {
          json(res, state.analyzeStatus, { error: { code: 'X', message: 'RAW API SENTENCE' } })
          return
        }
        json(res, 202, { data: { job_id: 'mystyle_e2e', status: 'processing' } })
      })
      return
    }

    if (req.method === 'GET' && path === '/v1/public/my-style/analyze/mystyle_e2e') {
      state.polls += 1
      if (state.polls <= state.processingPolls) {
        json(res, 200, { data: { status: 'processing' } })
        return
      }
      state.profile = { undertone: 'warm', depth: 'medium', frame: 'tall' }
      json(res, 200, { data: { status: 'ready', profile: state.profile } })
      return
    }

    if (req.method === 'POST' && path === '/v1/public/my-style/profile/clear') {
      void readBody(req).then(() => {
        state.cleared += 1
        state.profile = null
        json(res, 200, { data: { ok: true } })
      })
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
  Object.assign(state, {
    signedIn: true,
    analyzeStatus: 202,
    processingPolls: 1,
    profile: null,
    analyzed: [],
    polls: 0,
    cleared: 0,
  })
  await context.clearCookies()
})

const openSheet = async (page: import('@playwright/test').Page) => {
  await page.goto('/my-style')
  await page.getByRole('button', { name: 'Selfie / full body' }).click()
  await expect(page.getByText(MY_STYLE_CONSENT.title)).toBeVisible()
}

test('a signed-out visitor is sent to login and brought back to /my-style', async ({ page }) => {
  state.signedIn = false
  await page.goto('/my-style')
  await page.waitForURL((u) => u.pathname === '/login' && u.searchParams.get('return_to') === '/my-style')
})

test('the camera input does not exist until the consent is accepted', async ({ page }) => {
  await openSheet(page)
  expect(await page.locator('input[type="file"]').count()).toBe(0)

  await page.getByRole('button', { name: MY_STYLE_CONSENT.acceptLabel }).click()
  expect(await page.locator('input[type="file"]').count()).toBe(1)
})

test('happy path: the photo crosses the proxy as a JPEG, the palette appears', async ({ page }) => {
  const client = watchClientErrors(page)
  await openSheet(page)
  await page.getByRole('button', { name: MY_STYLE_CONSENT.acceptLabel }).click()

  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1x1 })

  await expect(page.getByText('Your palette is ready')).toBeVisible({ timeout: 30_000 })

  // Exactly one upload, with the consent version in the query and a multipart body
  // whose photo part is a JPEG (FF D8 FF) - the browser re-encoded the PNG.
  expect(state.analyzed).toHaveLength(1)
  const sent = state.analyzed[0]!
  expect(sent.query).toBe(`?consent_version=${MY_STYLE_CONSENT.version}`)
  expect(sent.contentType).toMatch(/^multipart\/form-data; boundary=/)
  expect(sent.body.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
  expect(sent.body.includes(Buffer.from('name="photo"'))).toBe(true)

  await page.getByRole('button', { name: 'See my picks' }).click()
  await expect(page.getByText('Your palette', { exact: true })).toBeVisible()
  await expect(page.getByText('maroon')).toBeVisible()
  await expect(page.getByText('yellow')).toBeVisible()
  // Never a skin-colour label on the card.
  await expect(page.getByText(/undertone|complexion|skin/i)).toHaveCount(0)
  client.expectClean('the My Style selfie flow')
})

test('over the monthly limit: plain copy, no polling, never the API sentence', async ({ page }) => {
  state.analyzeStatus = 402
  await openSheet(page)
  await page.getByRole('button', { name: MY_STYLE_CONSENT.acceptLabel }).click()
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1x1 })

  await expect(page.getByText(/reached this month's limit/i)).toBeVisible()
  expect(await page.getByText('RAW API SENTENCE').count()).toBe(0)
  expect(state.polls).toBe(0)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('Clear my data reaches the API and the palette card goes away', async ({ page }) => {
  state.profile = { undertone: 'warm', depth: 'medium', frame: 'tall' }
  await page.goto('/my-style')
  await expect(page.getByText('Your palette', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Clear my data' }).click()

  await expect(page.getByText('Your palette', { exact: true })).toHaveCount(0)
  expect(state.cleared).toBe(1)
})

test('the kids form has no file input', async ({ page }) => {
  await page.goto('/my-style')
  await page.getByRole('button', { name: 'For my child' }).click()
  expect(await page.locator('input[type="file"]').count()).toBe(0)
})
