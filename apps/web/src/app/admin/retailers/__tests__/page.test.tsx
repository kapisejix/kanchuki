import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import RetailersPage from '../page'
import type { ReactNode } from 'react'

// Controllable pathname — mirrors the admin layout's route-change keying.
// Unlike CollectionView (favorites survive via localStorage), the retailers
// page persists NOTHING in memory: the admin layout keys the content area by
// pathname, so a route change REMOUNTS the page and it refetches from scratch.
// The guarantee this test locks in is the mirror image — the remount is a real
// fresh page (stale selection/filter state does NOT leak), while the auth
// session (admin_key in sessionStorage) survives and still rides along on the
// refetch.
const nav = createControllablePathname('/admin/retailers')

function makeRetailer(i: number) {
  return {
    id: `r-${i}`,
    shop_name: i === 1 ? 'Meera Sarees' : 'Ravi Textiles',
    city: i === 1 ? 'Jaipur' : 'Delhi',
    state: i === 1 ? 'Rajasthan' : 'Delhi',
    phone: `9199999999${i}0`,
    plan: 'GROWTH',
    plan_status: 'ACTIVE',
    trial_ends_at: null,
    created_at: '2026-01-15T00:00:00Z',
    onboarding_completed: true,
    is_suspended: false,
    product_count: 120,
    customer_count: 45,
    collection_count: 6,
  }
}

const RETAILERS = [makeRetailer(1), makeRetailer(2)]

// Mirrors app/admin/layout.tsx's route-change keying: the content area is
// keyed on usePathname, so a route change REMOUNTS the page subtree
// (component state resets; only persisted state — sessionStorage — survives).
function AdminRouteKeyedHarness({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} data-testid="admin-route-keyed">
      {children}
    </div>
  )
}

describe('Admin retailers list survives a route change', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    nav.reset()
    sessionStorage.clear()
    sessionStorage.setItem('admin_key', 'k-test')
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: RETAILERS, pagination: { has_more: false, cursor: null } }),
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const pageElement = (pathname: string) => {
    nav.setPathname(pathname)
    return (
      <AdminRouteKeyedHarness>
        <RetailersPage />
      </AdminRouteKeyedHarness>
    )
  }

  it('fetches the list with the admin session key and renders rows', async () => {
    render(pageElement('/admin/retailers'))

    expect(await screen.findByText('Meera Sarees')).toBeInTheDocument()
    expect(screen.getByText('Ravi Textiles')).toBeInTheDocument()
    expect(screen.getByText('2 retailers shown')).toBeInTheDocument()

    // The refetch carries the persisted session key
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toContain('/v1/admin/retailers?limit=20')
    expect(call[1]).toEqual(expect.objectContaining({ headers: { 'x-admin-key': 'k-test' } }))
  })

  it('remounts fresh on route change — stale selection/filter reset, session persists', async () => {
    const { rerender } = render(pageElement('/admin/retailers'))
    await screen.findByText('Meera Sarees')

    // Build in-memory UI state: select a row + type a search filter.
    // fireEvent.click (not change) — the established pattern for React
    // controlled checkboxes in this codebase; toggleSelected ignores the
    // event value and flips state functionally.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Meera Sarees' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search by shop name, city, or phone...'), {
      target: { value: 'jaipur' },
    })
    expect(
      screen.getByPlaceholderText('Search by shop name, city, or phone...'),
    ).toHaveValue('jaipur')

    // Capture the keyed wrapper so we can prove a real remount happens
    const wrapperBefore = document.querySelector('[data-testid="admin-route-keyed"]')
    expect(wrapperBefore).not.toBeNull()

    // Client-side route change: /admin/retailers → /admin/customers. The
    // keyed content area remounts the page subtree — component state resets,
    // only the session (admin_key) survives. rerender() updates the SAME
    // root — a second render() would mount a parallel tree.
    rerender(pageElement('/admin/customers'))

    // The remount actually happened
    expect(document.querySelector('[data-testid="admin-route-keyed"]')).not.toBe(wrapperBefore)

    // Fresh page: refetched with the session key, stale in-memory state gone
    expect(await screen.findByText('Meera Sarees')).toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    // The refetch itself is filter-free — stale filter state must not leak
    // into the URL (the input reset alone wouldn't catch a buggy refetch)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1/admin/retailers?limit=20')
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('search=')
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ headers: { 'x-admin-key': 'k-test' } }),
    )
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Search by shop name, city, or phone...'),
    ).toHaveValue('')
  })
})
