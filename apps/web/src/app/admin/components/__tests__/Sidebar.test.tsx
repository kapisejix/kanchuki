import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Sidebar } from '../Sidebar'

// Controllable router/pathname so the active-link behavior can be tested per
// route (the shared next/navigation mock is fixed to '/admin').
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
let currentPath = '/admin'

vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

const noop = () => {}

function renderSidebar(overrides?: Partial<Parameters<typeof Sidebar>[0]>) {
  return render(
    <Sidebar
      collapsed={false}
      onToggle={noop}
      mobileOpen={false}
      onMobileClose={noop}
      {...overrides}
    />,
  )
}

describe('Sidebar state', () => {
  beforeEach(() => {
    currentPath = '/admin'
    pushMock.mockClear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders top-level links, group buttons, and sign out', () => {
    renderSidebar()
    for (const label of ['Dashboard', 'Retailers', 'Customers', 'Billing', 'Reports']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    for (const label of [
      'Plans',
      'Catalog',
      'Team',
      'Operations',
      'Settings',
      'Activity',
      'Database',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('collapsed hides link labels and switches the toggle label', () => {
    const { rerender } = renderSidebar({ collapsed: true })
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(screen.queryByText('Retailers')).not.toBeInTheDocument()
    expect(screen.queryByText('Kanchuki Admin')).not.toBeInTheDocument()
    // Links stay in the DOM as icon-only entries
    expect(document.querySelector('a[href="/admin/retailers"]')).toBeInTheDocument()

    rerender(
      <Sidebar collapsed={false} onToggle={noop} mobileOpen={false} onMobileClose={noop} />,
    )
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    expect(screen.getByText('Retailers')).toBeInTheDocument()
  })

  it('fires onToggle when the collapse toggle is clicked', () => {
    const onToggle = vi.fn()
    renderSidebar({ onToggle })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('marks only the current route link as active', () => {
    currentPath = '/admin/retailers'
    renderSidebar()

    // The active link's label span carries the cyan active class; inactive
    // links use the muted grey. (framer-motion's data-layoutid attribute is
    // not emitted under jsdom, so assert on the class contract instead.)
    const labelSpan = (label: string) =>
      screen.getByRole('link', { name: label }).querySelector('span') as HTMLElement

    expect(labelSpan('Retailers')).toHaveClass('text-cyan-400')
    expect(labelSpan('Dashboard')).toHaveClass('text-gray-400')
  })

  it('opens the group flyout on hover and closes it on leave', () => {
    renderSidebar()
    const plansGroup = screen.getByRole('button', { name: 'Plans' }).closest('div') as HTMLElement

    fireEvent.mouseEnter(plansGroup)
    expect(screen.getByRole('link', { name: 'Plan Limits' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan Features' })).toBeInTheDocument()

    fireEvent.mouseLeave(plansGroup)
    expect(screen.queryByRole('link', { name: 'Plan Limits' })).not.toBeInTheDocument()
  })

  it('closes the flyout and calls onMobileClose when a flyout link is clicked', () => {
    const onMobileClose = vi.fn()
    renderSidebar({ onMobileClose })
    const plansGroup = screen.getByRole('button', { name: 'Plans' }).closest('div') as HTMLElement

    fireEvent.mouseEnter(plansGroup)
    fireEvent.click(screen.getByRole('link', { name: 'Plan Limits' }))

    expect(onMobileClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: 'Plan Limits' })).not.toBeInTheDocument()
  })

  it('renders the mobile overlay + slide-in aside when mobileOpen, closes via overlay click', async () => {
    const onMobileClose = vi.fn()
    const { container, rerender } = renderSidebar({ mobileOpen: true, onMobileClose })

    expect(container.querySelector('aside')).toHaveClass('translate-x-0')
    const overlay = document.querySelector('.fixed.inset-0')
    expect(overlay).toBeInTheDocument()

    fireEvent.click(overlay as HTMLElement)
    expect(onMobileClose).toHaveBeenCalledTimes(1)

    rerender(
      <Sidebar collapsed={false} onToggle={noop} mobileOpen={false} onMobileClose={onMobileClose} />,
    )
    expect(container.querySelector('aside')).toHaveClass('-translate-x-full')
    // Overlay exits via AnimatePresence — wait for the exit animation to finish
    await waitFor(() => {
      expect(document.querySelector('.fixed.inset-0')).not.toBeInTheDocument()
    })
  })

  it('sign out clears the session key and redirects to /admin', () => {
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')
    sessionStorage.setItem('admin_key', 'k')
    renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(removeSpy).toHaveBeenCalledWith('admin_key')
    expect(pushMock).toHaveBeenCalledWith('/admin')
  })
})
