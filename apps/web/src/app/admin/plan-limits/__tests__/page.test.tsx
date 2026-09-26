import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PlanLimitsPage from '../page'

// The tier grid and the pricing table are not the subject here — the customer
// card is. One row each keeps the rest of the page mounted and honest (the page
// fetches all three in one Promise.all, so a stub that answers only the
// customer path would leave the screen on its loader) without pretending to
// cover surfaces other tests own.
const PLAN_LIMIT_ROWS = [
  { id: 'pl-1', plan: 'STARTER', resource_type: 'TRY_ON_GENERATION', limit_per_period: 10, period: 'MONTH' },
]
const PRICING_ROWS = [{ id: 'pp-1', plan: 'STARTER', monthly_paise: 499900 }]

function makeFetchStub(customerRows: unknown[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    // Matched on exact suffixes, and `customer` is checked first: it is one
    // prefix away from being served the plan rows.
    const data = url.endsWith('/v1/admin/plan-limits/customer')
      ? customerRows
      : url.endsWith('/v1/admin/plan-limits')
        ? PLAN_LIMIT_ROWS
        : url.endsWith('/v1/admin/plan-pricing')
          ? PRICING_ROWS
          : []
    return { ok: true, status: 200, json: async () => ({ data }) }
  })
}

describe('Admin Plan Limits — customer-limit card', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('admin_key', 'k-test')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a row per row the API returns, with that row’s number and period', async () => {
    // Neither the 37 nor the DAY exists anywhere else in the app, and the second
    // row's type is not in any list this repo ships — so a screen that rendered
    // from a local copy instead of the response cannot produce these rows. That
    // is the property that was missing when TRY_ON_GENERATION was absent from
    // the page's own array and the real row sat invisible (T5).
    vi.stubGlobal(
      'fetch',
      makeFetchStub([
        { resource_type: 'TRY_ON_GENERATION', limit_per_period: 37, period: 'DAY', configured: true },
        {
          resource_type: 'A_RESOURCE_THIS_APP_DOES_NOT_SHIP',
          limit_per_period: 5,
          period: 'LIFETIME',
          configured: true,
        },
      ]),
    )

    render(<PlanLimitsPage />)

    expect(await screen.findByLabelText('TRY_ON_GENERATION per-shopper limit')).toHaveValue(37)
    expect(screen.getByLabelText('TRY_ON_GENERATION period')).toHaveValue('DAY')
    expect(screen.getByLabelText('A_RESOURCE_THIS_APP_DOES_NOT_SHIP per-shopper limit')).toHaveValue(5)
  })

  it('shows an unconfigured row blank and marked, never as a cap of zero', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchStub([
        { resource_type: 'TRY_ON_GENERATION', limit_per_period: null, period: 'MONTH', configured: false },
      ]),
    )

    render(<PlanLimitsPage />)

    const input = await screen.findByLabelText('TRY_ON_GENERATION per-shopper limit')
    // Blank, not 0. A missing row means checkQuota() fails open, so a zero here
    // would read as "no shopper may ever generate" — the opposite of the truth.
    //
    // The mutation that turns this red is the `0` one: writing `String(null)`
    // would not, because a number input rejects the literal "null" and reads
    // back empty — the DOM hides that bug rather than showing it.
    expect(input).toHaveValue(null)
    const row = input.closest('tr') as HTMLElement
    expect(within(row).getByText('not set')).toBeInTheDocument()
  })

  it('says so when the API returns nothing customer-metered', async () => {
    vi.stubGlobal('fetch', makeFetchStub([]))

    render(<PlanLimitsPage />)

    expect(await screen.findByText('No customer-metered resources yet.')).toBeInTheDocument()
  })
})

const UNSET_ROW = {
  resource_type: 'TRY_ON_GENERATION',
  limit_per_period: null,
  period: 'MONTH',
  configured: false,
}

/** Same GET routing as `makeFetchStub`, plus a PUT arm that records the body
 *  and answers with what the server STORED — which the tests make deliberately
 *  disagree with what was typed. */
function makeSaveStub(opts: { putStatus?: number; stored?: Record<string, unknown> } = {}) {
  const puts: Record<string, unknown>[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (method === 'PUT') {
      puts.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      if (opts.putStatus && opts.putStatus >= 400) {
        return { ok: false, status: opts.putStatus, json: async () => ({ error: { message: 'nope' } }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { ...UNSET_ROW, configured: true, ...opts.stored } }),
      }
    }

    const data = url.endsWith('/v1/admin/plan-limits/customer')
      ? [UNSET_ROW]
      : url.endsWith('/v1/admin/plan-limits')
        ? PLAN_LIMIT_ROWS
        : url.endsWith('/v1/admin/plan-pricing')
          ? PRICING_ROWS
          : []
    return { ok: true, status: 200, json: async () => ({ data }) }
  })
  return { fetchMock, puts }
}

describe('Admin Plan Limits — customer-limit save', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('admin_key', 'k-test')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('PUTs the edited number, then shows what the server stored rather than what was typed', async () => {
    // The stored value disagrees with the typed one on purpose: 999 → 50 and
    // MONTH → DAY. A card that kept its own copy would keep displaying 999/MONTH
    // while the cap in force was something else entirely.
    const { fetchMock, puts } = makeSaveStub({
      stored: { limit_per_period: 50, period: 'DAY' },
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanLimitsPage />)

    const input = await screen.findByLabelText('TRY_ON_GENERATION per-shopper limit')
    const row = input.closest('tr') as HTMLElement
    // Starts unconfigured, because the API said there is no row yet.
    expect(input).toHaveValue(null)
    expect(within(row).getByText('not set')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.click(screen.getByLabelText('Save customer TRY_ON_GENERATION'))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      resource_type: 'TRY_ON_GENERATION',
      limit_per_period: 999,
      period: 'MONTH',
    })

    // Saved — so the row is no longer unset, and the field now shows the value
    // the server holds.
    await waitFor(() => expect(input).toHaveValue(50))
    expect(screen.getByLabelText('TRY_ON_GENERATION period')).toHaveValue('DAY')
    expect(within(row).queryByText('not set')).not.toBeInTheDocument()
    expect(await screen.findByText(/Customer TRY_ON_GENERATION saved/)).toBeInTheDocument()
  })

  it('refuses to PUT a blank number instead of sending a zero cap', async () => {
    const { fetchMock, puts } = makeSaveStub()
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanLimitsPage />)

    await screen.findByLabelText('TRY_ON_GENERATION per-shopper limit')
    // Blank means "no row = unlimited", so an empty field must never be written
    // as 0 — the server would read that as "no shopper may generate".
    fireEvent.click(screen.getByLabelText('Save customer TRY_ON_GENERATION'))

    expect(await screen.findByText('❌ Enter a number, or -1 for unlimited')).toBeInTheDocument()
    expect(puts).toHaveLength(0)
  })

  it('leaves the row unset when the save is rejected', async () => {
    // A 401, because the admin session lapsed. Nothing was stored, so the row
    // must not come back reading as configured.
    const { fetchMock, puts } = makeSaveStub({ putStatus: 401 })
    vi.stubGlobal('fetch', fetchMock)

    render(<PlanLimitsPage />)

    const input = await screen.findByLabelText('TRY_ON_GENERATION per-shopper limit')
    const row = input.closest('tr') as HTMLElement
    fireEvent.change(input, { target: { value: '50' } })
    fireEvent.click(screen.getByLabelText('Save customer TRY_ON_GENERATION'))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(await screen.findByText('❌ Save failed')).toBeInTheDocument()
    expect(within(row).getByText('not set')).toBeInTheDocument()
    expect(input).toHaveValue(50)
  })
})
