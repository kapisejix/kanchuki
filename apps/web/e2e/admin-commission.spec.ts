import { test, expect, type Page } from '@playwright/test'

// Feature + regression coverage for the admin 3% commission tracker
// (/admin/commission): current-month cards, monthly summary table,
// expenditure grid, row-detail popup, and the add/edit/delete flows.
//
// Hermetic — every /v1/* call is answered with canned JSON via route mocks
// (same pattern as admin-navigation.spec.ts), so no backend, database, or
// migration is needed to run it. The API contract is additionally covered
// by unit tests (apps/api/src/routes/admin/admin-commission.test.ts).

const ADMIN_KEY = 'e2e-admin-test-key'

// ── Time control ────────────────────────────────────────────────────
// The commission page defaults its month picker / expenditure header /
// add-form period to the CURRENT calendar month (new Date()), while this
// suite's fixtures are pinned to August 2026. Freeze the page clock to
// mid-August 2026 so the default month is always 2026-08 regardless of when
// CI runs — without this the suite only passes in August (it drifted the
// day the calendar rolled into September). Mid-month UTC stays within
// August in every timezone the browser may run in.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-15T06:00:00.000Z') })
})

// ── Fixtures (mirror the API's wire shapes: paise, ISO dates, YYYY-MM) ──

const FAKE_EXPENSES = [
  {
    id: 'exp_1',
    period: '2026-08',
    amount_inr: 120000, // ₹1,200
    category: 'Instagram Ads',
    expense_date: '2026-08-10T06:00:00.000Z', // Aug 10 in IST
    notes: 'Boosted posts for the new kurti collection',
    created_at: '2026-08-10T06:00:00.000Z',
  },
  {
    id: 'exp_2',
    period: '2026-08',
    amount_inr: 50000, // ₹500
    category: 'Travel',
    expense_date: '2026-08-12T06:00:00.000Z',
    notes: 'Client visit — Delhi',
    created_at: '2026-08-12T06:00:00.000Z',
  },
]

const OVERVIEW = [
  { period: '2026-08', total_payment_inr: 10000000, commission_inr: 300000, spent_inr: 170000, remaining_inr: 130000, expense_count: 2 },
  { period: '2026-07', total_payment_inr: 8000000, commission_inr: 240000, spent_inr: 240000, remaining_inr: 0, expense_count: 1 },
  { period: '2026-06', total_payment_inr: 5000000, commission_inr: 150000, spent_inr: 0, remaining_inr: 150000, expense_count: 0 },
]

type MockState = {
  expenses: Array<(typeof FAKE_EXPENSES)[number] & Record<string, unknown>>
  created: Array<Record<string, unknown>>
  patched: Record<string, unknown> | null
  deletedId: string | null
}

function freshState(): MockState {
  return { expenses: [...FAKE_EXPENSES], created: [], patched: null, deletedId: null }
}

async function mockCommissionApi(page: Page, state: MockState): Promise<void> {
  await page.route('**/v1/**', async (route) => {
    const req = route.request()
    const url = req.url()
    const method = req.method()
    const respond = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) })

    // Layout/shell dependencies
    if (url.includes('/admin/alerts')) return respond([])
    if (url.includes('/admin/session')) return respond({ authenticated: true })
    if (url.includes('/admin/csrf-token')) return respond({ csrf_token: 'e2e-csrf-token' })

    if (url.includes('/admin/commission/export')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        // access-control-expose-headers mirrors the real API's CORS config so
        // the cross-origin page can read content-disposition (filename).
        headers: {
          'content-disposition': 'attachment; filename="kanchuki-commission-3m-202608.csv"',
          'access-control-expose-headers': 'content-disposition',
        },
        body: 'Month,Date,Category,Amount (INR),Notes\r\n2026-08,2026-08-10,"Instagram Ads",1200.00,"Boosted posts"\r\n',
      })
    }

    if (url.includes('/admin/commission/overview')) return respond(OVERVIEW)

    if (url.includes('/admin/commission/expenses')) {
      const idMatch = url.match(/\/commission\/expenses\/([^/?]+)/)

      if (method === 'POST') {
        const payload = JSON.parse(req.postData() ?? '{}')
        state.created.push(payload)
        const created = { id: 'exp_new', ...payload, created_at: new Date().toISOString() }
        state.expenses = [created, ...state.expenses]
        return respond(created)
      }
      if (idMatch && method === 'PATCH') {
        const payload = JSON.parse(req.postData() ?? '{}')
        state.patched = payload
        state.expenses = state.expenses.map((e) => (e.id === idMatch[1] ? { ...e, ...payload } : e))
        return respond({ id: idMatch[1], ...payload })
      }
      if (idMatch && method === 'DELETE') {
        state.deletedId = idMatch[1]
        state.expenses = state.expenses.filter((e) => e.id !== idMatch[1])
        return route.fulfill({ status: 204, body: '' })
      }
      // GET list — summary rolls up from the (possibly mutated) list
      const spent = state.expenses.reduce((s, e) => s + (e.amount_inr as number), 0)
      return respond({
        month: '2026-08',
        summary: {
          total_payment_inr: 10000000,
          commission_inr: 300000,
          spent_inr: spent,
          remaining_inr: 300000 - spent,
          expense_count: state.expenses.length,
        },
        expenses: state.expenses,
      })
    }

    return respond({})
  })
}

// ── Helpers ──────────────────────────────────────────────────────

async function seedAdminSession(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    sessionStorage.setItem('admin_key', key)
  }, ADMIN_KEY)
}

async function openExpenditureTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Expenditure', exact: true }).click()
  await expect(page.getByText('Expenditure · August 2026', { exact: true })).toBeVisible()
}

// The edit/add modal's "where" input: no type/inputmode attributes
// (amount = inputmode decimal, date = type date, month = select).
function whereInput(page: Page) {
  return page.locator('.max-w-md input:not([type="date"]):not([inputmode="decimal"])')
}

// ── Tests ────────────────────────────────────────────────────────

test('renders current-month cards and the monthly summary table', async ({ page }) => {
  const state = freshState()
  await mockCommissionApi(page, state)
  await seedAdminSession(page)

  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.goto('/admin/commission')
  await expect(page.getByRole('heading', { name: 'Commission', exact: true })).toBeVisible()

  // Current-month cards
  await expect(page.getByText('Total Payments · August 2026', { exact: true })).toBeVisible()
  await expect(page.getByText('3% Commission Pool', { exact: true })).toBeVisible()
  await expect(page.getByText('₹3,000', { exact: true }).first()).toBeVisible() // pool
  await expect(page.getByText('₹1,700', { exact: true }).first()).toBeVisible() // spent

  // Monthly summary table — payments → 3% → spent → remaining per month
  const augRow = page.getByRole('row').filter({ hasText: 'August 2026' })
  await expect(augRow).toContainText('₹1,00,000')
  await expect(augRow).toContainText('₹3,000')
  await expect(augRow).toContainText('₹1,700')
  await expect(augRow).toContainText('₹1,300')

  const julyRow = page.getByRole('row').filter({ hasText: 'July 2026' })
  await expect(julyRow).toContainText('₹80,000')
  await expect(julyRow).toContainText('₹2,400')
  await expect(julyRow).toContainText('₹0') // spent all of it

  await expect(page.getByRole('row').filter({ hasText: 'June 2026' })).toContainText('₹1,500')

  expect(pageErrors).toEqual([])
})

test('expenditure tab lists expenses and the row popup shows full details', async ({ page }) => {
  const state = freshState()
  await mockCommissionApi(page, state)
  await seedAdminSession(page)

  await page.goto('/admin/commission')
  await openExpenditureTab(page)

  // Grid rows
  await expect(page.getByText('Instagram Ads', { exact: true })).toBeVisible()
  await expect(page.getByText('Travel', { exact: true })).toBeVisible()
  await expect(page.getByText('₹1,200', { exact: true }).first()).toBeVisible()

  // Row click → detail popup with the full record
  await page.getByText('Instagram Ads', { exact: true }).click()
  await expect(page.getByText('Boosted posts for the new kurti collection', { exact: true })).toBeVisible()
  await expect(page.getByText('₹1,200', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('August 2026', { exact: true }).first()).toBeVisible() // month row
  await expect(page.getByRole('button', { name: 'Edit expense', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete expense', exact: true })).toBeVisible()
})

test('edit from the detail popup PATCHes the expense and closes', async ({ page }) => {
  const state = freshState()
  await mockCommissionApi(page, state)
  await seedAdminSession(page)

  await page.goto('/admin/commission')
  await openExpenditureTab(page)
  await page.getByText('Instagram Ads', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit expense', exact: true }).click()
  await expect(page.getByText('Edit Expense', { exact: true })).toBeVisible()

  // Date prefills in IST: 2026-08-10T06:00:00Z is Aug 10 in India, never Aug 9.
  await expect(page.locator('.max-w-md input[type="date"]')).toHaveValue('2026-08-10')

  await page.locator('.max-w-md input[inputmode="decimal"]').fill('1500')
  await whereInput(page).fill('Instagram + Meta ads')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()

  await expect(page.getByText('Edit Expense', { exact: true })).toBeHidden()
  // PATCH payload: paise, category changed, date preserved as IST midnight UTC
  expect(state.patched).toEqual({
    period: '2026-08',
    amount_inr: 150000,
    category: 'Instagram + Meta ads',
    expense_date: '2026-08-09T18:30:00.000Z',
    notes: 'Boosted posts for the new kurti collection',
  })
  // Grid refetches and shows the updated row
  await expect(page.getByText('Instagram + Meta ads', { exact: true })).toBeVisible()
})

test('exports expenditure as CSV for the selected range', async ({ page }) => {
  const state = freshState()
  await mockCommissionApi(page, state)
  await seedAdminSession(page)

  const downloadPromise = page.waitForEvent('download')
  await page.goto('/admin/commission')
  await openExpenditureTab(page)

  await page.getByRole('button', { name: /Export CSV/ }).click()
  await page.getByRole('button', { name: 'Last 3 months', exact: true }).click()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/kanchuki-commission-3m-.*\.csv/)
})

test('adds an expense from the form and deletes it from the popup', async ({ page }) => {
  const state = freshState()
  await mockCommissionApi(page, state)
  await seedAdminSession(page)

  await page.goto('/admin/commission')
  await openExpenditureTab(page)

  // Add
  await page.getByRole('button', { name: 'Add Expense', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add Expense', exact: true })).toBeVisible()
  await page.locator('.max-w-md input[inputmode="decimal"]').fill('2500')
  await whereInput(page).fill('Google Ads')
  await page.getByRole('button', { name: 'Record Expense', exact: true }).click()

  await expect(page.getByText('Google Ads', { exact: true })).toBeVisible() // in the refetched grid
  expect(state.created).toHaveLength(1)
  expect(state.created[0]).toMatchObject({
    period: '2026-08',
    amount_inr: 250000,
    category: 'Google Ads',
  })

  // Delete (with confirm)
  await page.getByText('Google Ads', { exact: true }).click()
  await page.getByRole('button', { name: 'Delete expense', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, delete', exact: true }).click()

  await expect(page.locator('.divide-y').getByText('Google Ads', { exact: true })).toBeHidden()
  expect(state.deletedId).toBe('exp_new')
})
