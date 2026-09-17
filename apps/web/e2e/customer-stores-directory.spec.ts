import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'node:http'

// /stores customer entry point — live verification.
//
// Same harness as the other customer specs: real `next start` prod build, real
// Chrome, hermetic stub API on :3001. The stub is required because the directory
// page is server-rendered (`fetchDirectory()` runs inside `next start`, where
// browser-side routing cannot reach it) and because the passport session is
// HttpOnly — only the server can answer "is this visitor signed in?".
//
// ── What this proves that the unit tests cannot ────────────────────
// 1. The entry point actually renders on the real page (a client component
//    inside a statically-rendered route), not just in jsdom.
// 2. Signing in changes what the real browser shows — the shopper's name
//    instead of "Log in" — driven end to end through the /api/passport/me
//    proxy, and it links where the unit test claims.
// 3. Adding it did not break the directory itself.

const API_STUB_PORT = 3001
const API_STUB_ORIGIN = `http://127.0.0.1:${API_STUB_PORT}`

let apiStub: Server | null = null
const state = { signedIn: false, requests: [] as string[] }

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  // The directory fetch is the one call in these specs made *by the browser*
  // directly to the API origin (the passport calls go through the web's
  // same-origin /api/passport proxy). localhost:3100 → 127.0.0.1:3001 is
  // cross-origin, so without this the browser blocks the response and the
  // directory silently renders its error state. The real API sends this for
  // the web origin; the stub has to match.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

test.beforeAll(async () => {
  apiStub = createServer((req, res) => {
    const url = new URL(req.url ?? '/', API_STUB_ORIGIN)
    const path = url.pathname
    state.requests.push(`${req.method} ${path}`)

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.statusCode = 204
      res.end()
      return
    }

    if (path === '/v1/public/passport/me') {
      if (!state.signedIn) {
        json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
        return
      }
      json(res, 200, {
        account: {
          id: 'customer-1',
          name: 'Ananya Sharma',
          phone_masked: '••••••9999',
          usual_size: 'M',
          city: 'Jaipur',
        },
      })
      return
    }

    // The directory listing itself.
    if (path === '/v1/public/stores' && req.method === 'GET') {
      json(res, 200, {
        data: {
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
        },
      })
      return
    }

    json(res, 404, { error: { code: 'NOT_FOUND', message: `No stub for ${path}` } })
  })

  await new Promise<void>((resolve, reject) => {
    apiStub?.once('error', reject)
    apiStub?.listen(API_STUB_PORT, '127.0.0.1', resolve)
  })
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (!apiStub) return resolve()
    apiStub.close(() => resolve())
  })
})

test.beforeEach(async ({ context }) => {
  state.signedIn = false
  state.requests = []
  await context.clearCookies()
})

test('a signed-out visitor is offered Log in on the directory', async ({ page }) => {
  await page.goto('/stores')

  const entry = page.getByRole('link', { name: /^log in$/i })
  await expect(entry).toBeVisible()
  expect(await entry.getAttribute('href')).toBe('/login')

  // The page around it still works — search box renders, and the directory
  // data arrives from the client-side fetch.
  await expect(page.getByLabel('Search stores')).toBeVisible()
  await expect(page.getByText('Meera Sarees')).toBeVisible()

  // The session was asked for through the web proxy, not the API origin.
  expect(state.requests).toContain('GET /v1/public/passport/me')
})

test("a signed-in shopper sees their own name there, linking to their stores", async ({ page }) => {
  state.signedIn = true
  await page.goto('/stores')

  const entry = page.getByRole('link', { name: /ananya sharma/i })
  await expect(entry).toBeVisible()
  expect(await entry.getAttribute('href')).toBe('/my-stores')

  // Still not inviting them to log in again.
  expect(await page.getByRole('link', { name: /^log in$/i }).count()).toBe(0)
})
