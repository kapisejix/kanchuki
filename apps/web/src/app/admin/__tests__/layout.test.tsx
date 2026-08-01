import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import AdminLayout from '../layout'

// LoginScreen is lazy-loaded via next/dynamic({ ssr: false }). In jsdom that
// async boundary never resolves deterministically, so stub it with a marker
// element — this test locks the layout's auth/session gate, not the login form.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const LoginScreenStub = () => <div data-testid="login-screen">Admin Login</div>
    return LoginScreenStub
  },
}))

// Controllable pathname so the shell-persistence test can simulate a real
// route change. The shared next/navigation mock (aliased in vitest.config.ts)
// is stateful — createControllablePathname() returns a handle that mutates
// the shared module state, and usePathname() reads it on every render.
const nav = createControllablePathname('/admin')

const STATS_URL = expect.stringContaining('/v1/admin/stats')

function statsFetchCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(
    (call) => typeof call[0] === 'string' && call[0].includes('/v1/admin/stats'),
  ).length
}

function okResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  }
}

describe('AdminLayout auth/session check', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    nav.reset()
    // The layout chains .then() on the fetch result — the base implementation
    // must return a real Promise (resolve to a Response-like object).
    fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the login screen without fetching when no session key is stored', async () => {
    render(<AdminLayout>content</AdminLayout>)
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders the admin shell when a stored key passes the stats check', async () => {
    sessionStorage.setItem('admin_key', 'k-test')
    render(
      <AdminLayout>
        <div>Shell content</div>
      </AdminLayout>,
    )

    // Shell mounts (sidebar chrome + header + children); login never shows
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Kanchuki Admin')).toBeInTheDocument()
    expect(screen.getByText('Shell content')).toBeInTheDocument()
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument()

    // The session check validates the stored key against the stats endpoint
    expect(fetchMock).toHaveBeenCalledWith(
      STATS_URL,
      expect.objectContaining({ headers: { 'x-admin-key': 'k-test' } }),
    )
  })

  it('clears the stored key and shows login when the stats check is rejected (401)', async () => {
    sessionStorage.setItem('admin_key', 'k-bad')
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'unauthorized' } }),
    })

    render(<AdminLayout>content</AdminLayout>)
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument()
    expect(sessionStorage.getItem('admin_key')).toBeNull()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('clears the stored key and shows login when the stats request fails (network)', async () => {
    sessionStorage.setItem('admin_key', 'k-offline')
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    render(<AdminLayout>content</AdminLayout>)
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument()
    expect(sessionStorage.getItem('admin_key')).toBeNull()
  })

  it('shows the session-check spinner while validating — no flash of the login screen', async () => {
    sessionStorage.setItem('admin_key', 'k-slow')
    let resolveStats!: (value: unknown) => void
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStats = resolve
      }),
    )

    render(<AdminLayout>content</AdminLayout>)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()

    act(() => {
      resolveStats(okResponse())
    })
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument()
  })

  it('persists the shell across a real route change — only the keyed content remounts', async () => {
    sessionStorage.setItem('admin_key', 'k-test')
    const { rerender } = render(
      <AdminLayout>
        <div>Page one</div>
      </AdminLayout>,
    )
    expect(await screen.findByText('Page one')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    // One session check on mount, before any navigation
    expect(statsFetchCount(fetchMock)).toBe(1)

    // Capture the shell chrome DOM nodes — these must survive the route
    // change as the SAME element instances (the sidebar/header are not
    // keyed, so React never remounts them). This is the regression the
    // original next/dynamic({ssr:false}) shell had: the whole chrome
    // remounted on every navigation (user issue #1).
    const sidebarBefore = document.querySelector('aside')
    const headerBefore = document.querySelector('header')
    const mainBefore = document.querySelector('main')
    expect(sidebarBefore).not.toBeNull()
    expect(headerBefore).not.toBeNull()

    // Real route change: pathname moves /admin → /admin/retailers. The
    // keyed motion.main remounts (content swaps + entrance animation), but
    // the layout component instance — and with it the shell — persists.
    nav.setPathname('/admin/retailers')
    rerender(
      <AdminLayout>
        <div>Page two</div>
      </AdminLayout>,
    )
    expect(screen.getByText('Page two')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Kanchuki Admin')).toBeInTheDocument()

    // Sidebar + header are the exact same DOM nodes — not remounted
    expect(document.querySelector('aside')).toBe(sidebarBefore)
    expect(document.querySelector('header')).toBe(headerBefore)
    // Content area is keyed by pathname → remounted with the new route
    expect(document.querySelector('main')).not.toBe(mainBefore)
    // The shell re-read the new pathname: the sidebar active link moved to
    // Retailers (same label-span class contract the Sidebar tests use)
    const labelSpan = (label: string) =>
      screen.getByRole('link', { name: label }).querySelector('span') as HTMLElement
    expect(labelSpan('Retailers')).toHaveClass('text-cyan-400')
    expect(labelSpan('Dashboard')).toHaveClass('text-gray-400')
    // The layout stayed mounted, so the session check did NOT re-run
    expect(statsFetchCount(fetchMock)).toBe(1)
  })
})
