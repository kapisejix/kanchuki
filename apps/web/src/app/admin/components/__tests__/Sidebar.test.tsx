import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import { Sidebar } from '../Sidebar'

// Controllable router/pathname so the active-link behavior can be tested per
// route. The shared next/navigation mock is stateful; the handle exposes the
// router's push mock for the sign-out assertion (nav.router.push).
const nav = createControllablePathname('/admin')

const noop = () => {}

function renderSidebar(overrides?: Partial<Parameters<typeof Sidebar>[0]>) {
  return render(
    <Sidebar
      collapsed={false}
      onToggle={noop}
      mobileOpen={false}
      onMobileClose={noop}
      onLogout={noop}
      {...overrides}
    />,
  )
}

describe('Sidebar state', () => {
  beforeEach(() => {
    nav.reset()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders top-level group buttons and sign out', () => {
    renderSidebar()
    for (const label of [
      'Overview',
      'Retailers & Network',
      'Catalog & Creative',
      'Team & Support',
      'Reports & Finance',
      'Settings & Operations',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('collapsed hides link labels and switches the toggle label', () => {
    const { rerender } = renderSidebar({ collapsed: true })
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(screen.queryByText('Kanchuki Admin')).not.toBeInTheDocument()

    rerender(
      <Sidebar
        collapsed={false}
        onToggle={noop}
        mobileOpen={false}
        onMobileClose={noop}
        onLogout={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    expect(screen.getByText('Retailers & Network')).toBeInTheDocument()
  })

  it('fires onToggle when the collapse toggle is clicked', () => {
    const onToggle = vi.fn()
    renderSidebar({ onToggle })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('opens the group flyout on hover and closes it on leave', () => {
    renderSidebar()
    const overviewGroup = screen.getByRole('button', { name: 'Overview' }).closest('div') as HTMLElement

    fireEvent.mouseEnter(overviewGroup)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Activity Feed' })).toBeInTheDocument()

    fireEvent.mouseLeave(overviewGroup)
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('closes the flyout and calls onMobileClose when a flyout link is clicked', () => {
    const onMobileClose = vi.fn()
    renderSidebar({ onMobileClose })
    const overviewGroup = screen.getByRole('button', { name: 'Overview' }).closest('div') as HTMLElement

    fireEvent.mouseEnter(overviewGroup)
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))

    expect(onMobileClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
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
      <Sidebar
        collapsed={false}
        onToggle={noop}
        mobileOpen={false}
        onMobileClose={onMobileClose}
        onLogout={noop}
      />,
    )
    expect(container.querySelector('aside')).toHaveClass('-translate-x-full')
    // Overlay exits via AnimatePresence — wait for the exit animation to finish
    await waitFor(() => {
      expect(document.querySelector('.fixed.inset-0')).not.toBeInTheDocument()
    })
  })

  it('sign out clears the session key, fires onLogout, and redirects to /admin', () => {
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')
    const onLogout = vi.fn()
    sessionStorage.setItem('admin_key', 'k')
    renderSidebar({ onLogout })

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(removeSpy).toHaveBeenCalledWith('admin_key')
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(nav.router.push).toHaveBeenCalledWith('/admin')
  })
})
