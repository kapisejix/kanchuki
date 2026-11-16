import { expect, test } from '@playwright/test'
import type { Server } from 'node:http'
import { MY_STYLE_BODY_CONSENT } from '@kanchuki/shared'
import { API_STUB_ORIGIN, closeStub, createStubServer, json, listenStub } from './support/api-stub'
import { watchClientErrors } from './support/responsive'

// F-045 spec steps 2-4 - /my-style measurements card + suggested size, in real Chrome through the
// REAL web proxy. Stubbed (RC-048): only the API on :3001.

type Body = Record<string, unknown>
type Measurements = {
  height_cm: number | null
  bust_cm: number | null
  waist_cm: number | null
  hip_cm: number | null
  saved_at: string
}

const state: {
  measurements: Measurements | null
  saves: Body[]
  withdrawn: number
  saveStatus: number
} = { measurements: null, saves: [], withdrawn: 0, saveStatus: 200 }

let apiStub: Server | null = null

function readJson(req: import('node:http').IncomingMessage): Promise<Body> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')))
  })
}

test.beforeAll(async () => {
  apiStub = createStubServer((req, res) => {
    const path = new URL(req.url ?? '/', API_STUB_ORIGIN).pathname

    if (path === '/v1/public/passport/me') {
      json(res, 200, {
        account: { id: 'customer-1', name: 'Ananya', phone_masked: 'â€¢â€¢â€¢â€¢â€¢â€¢9999', usual_size: 'M', city: 'Jaipur' },
      })
      return
    }
    if (req.method === 'POST' && path === '/v1/public/my-style/feed') {
      void readJson(req).then(() => {
        const bust = state.measurements?.bust_cm ?? null
        json(res, 200, {
          data: [
            {
              id: 'p1',
              name: 'Test Kurti',
              price_min: 150000,
              price_max: 150000,
              primary_photo_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
              distance_km: null,
              retailer: { shop_name: 'Test Store', slug: 'test-store', city: 'Jaipur' },
              suggested_size: bust === 87 ? { size: 'M' } : null,
            },
          ],
          meta: {
            total: 1,
            page: 1,
            limit: 12,
            sort: 'best',
            location_scope: 'city',
            rationale_source: 'none',
            truncated: false,
            style_profile: null,
            measurements: state.measurements,
          },
        })
      })
      return
    }
    if (req.method === 'POST' && path === '/v1/public/my-style/measurements') {
      void readJson(req).then((body) => {
        state.saves.push(body)
        if (state.saveStatus !== 200) {
          json(res, state.saveStatus, { error: { code: 'X', message: 'RAW API SENTENCE' } })
          return
        }
        state.measurements = {
          height_cm: (body.height_cm as number) ?? null,
          bust_cm: (body.bust_cm as number) ?? null,
          waist_cm: (body.waist_cm as number) ?? null,
          hip_cm: (body.hip_cm as number) ?? null,
          saved_at: new Date().toISOString(),
        }
        json(res, 200, { data: { measurements: state.measurements } })
      })
      return
    }
    if (req.method === 'POST' && path === '/v1/public/my-style/measurements/withdraw') {
      void readJson(req).then(() => {
        state.withdrawn += 1
        state.measurements = null
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
  Object.assign(state, { measurements: null, saves: [], withdrawn: 0, saveStatus: 200 })
  await context.clearCookies()
})

test('consent comes first, declining shows no form, accepting shows the fields and no weight', async ({ page }) => {
  await page.goto('/my-style')
  await expect(page.getByText(MY_STYLE_BODY_CONSENT.title)).toBeVisible()
  expect(await page.getByLabel('Waist (cm)').count()).toBe(0)

  await page.getByRole('button', { name: MY_STYLE_BODY_CONSENT.declineLabel }).click()
  await expect(page.getByRole('button', { name: 'Add my measurements' })).toBeVisible()
  expect(await page.getByLabel('Waist (cm)').count()).toBe(0)
  expect(state.saves).toHaveLength(0)

  await page.getByRole('button', { name: 'Add my measurements' }).click()
  await page.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }).click()
  for (const l of ['Bust / chest (cm)', 'Waist (cm)', 'Hip (cm)']) {
    await expect(page.getByLabel(l)).toBeVisible()
  }
  await expect(page.getByLabel(/weight/i)).toHaveCount(0)
})

test('validation blocks an out-of-range number and nothing reaches the API', async ({ page }) => {
  await page.goto('/my-style')
  await page.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }).click()
  await page.getByLabel('Bust / chest (cm)').fill('999')
  await page.getByRole('button', { name: 'Save measurements' }).click()
  await expect(page.locator('p[role="alert"]')).toContainText(/between 50 and 160/)
  expect(state.saves).toHaveLength(0)

  await page.getByLabel('Bust / chest (cm)').fill('')
  await page.getByRole('button', { name: 'Save measurements' }).click()
  await expect(page.locator('p[role="alert"]')).toContainText('Enter at least one measurement')
})

test('save sends the consent version, the card shows "Your size: M", remove clears it', async ({ page }) => {
  const client = watchClientErrors(page)
  await page.goto('/my-style')
  await expect(page.getByText(/Your size:/)).toHaveCount(0)

  await page.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }).click()
  await page.getByLabel('Bust / chest (cm)').fill('87')
  await page.getByRole('button', { name: 'Save measurements' }).click()

  await expect(page.getByText('Your size: M')).toBeVisible()
  expect(state.saves).toHaveLength(1)
  expect(state.saves[0]).toMatchObject({ bust_cm: 87, consent_version: MY_STYLE_BODY_CONSENT.version })

  await page.getByRole('button', { name: 'Remove my measurements' }).click()
  await expect(page.getByText(/Your size:/)).toHaveCount(0)
  expect(state.withdrawn).toBe(1)
  client.expectClean('the My Style measurements flow')
})

test('a failed save says so plainly and never shows the API sentence', async ({ page }) => {
  state.saveStatus = 500
  await page.goto('/my-style')
  await page.getByRole('button', { name: MY_STYLE_BODY_CONSENT.acceptLabel }).click()
  await page.getByLabel('Bust / chest (cm)').fill('87')
  await page.getByRole('button', { name: 'Save measurements' }).click()
  await expect(page.locator('p[role="alert"]')).toContainText('We could not save your measurements')
  expect(await page.getByText('RAW API SENTENCE').count()).toBe(0)
  await expect(page.getByText('Saved.')).toHaveCount(0)
})
