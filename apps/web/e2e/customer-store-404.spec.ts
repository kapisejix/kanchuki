import { test, expect } from '@playwright/test'
import { API_STUB_ORIGIN, closeStub, createStubServer, json, listenStub } from './support/api-stub'

// Unknown store slugs must return a real HTTP 404, not a 200 "not found" shell
// (soft-404). Regression for docs/tasks/pending/storefront-soft-404.md §4.2:
// `[store]/loading.tsx` flushes the 200 before the page's notFound() runs, so
// the existence check lives in `[store]/layout.tsx`, above that boundary.
// Server-rendered fetches → only the stub API can control them.

let apiStub: ReturnType<typeof createStubServer> | null = null

test.beforeAll(async () => {
  apiStub = createStubServer((req, res) => {
    const path = new URL(req.url ?? '/', API_STUB_ORIGIN).pathname
    if (path === '/v1/public/retailers/real-store') {
      json(res, 200, { data: { shop_name: 'Real Store', city: null, state: null, categories: [] } })
      return
    }
    json(res, 404, { error: { code: 'NOT_FOUND', message: `No stub for ${path}` } })
  })
  await listenStub(apiStub)
})

test.afterAll(async () => {
  await closeStub(apiStub)
})

test('unknown store root returns 404', async ({ request }) => {
  const res = await request.get('/ghost-store')
  expect(res.status()).toBe(404)
})

test('unknown store + unknown collection returns 404', async ({ request }) => {
  const res = await request.get('/ghost-store/nope', { maxRedirects: 0 })
  // Either a direct 404 or a redirect that lands on a 404 — never a 200 shell.
  expect([307, 308, 404]).toContain(res.status())
  const final = await request.get('/ghost-store/categories')
  expect(final.status()).toBe(404)
})

test('existing store is not 404', async ({ request }) => {
  const res = await request.get('/real-store')
  expect(res.status()).not.toBe(404)
})
