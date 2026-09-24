import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import { Sidebar } from '../Sidebar'
import ReferralSettingsPage from '@/app/admin/referral-settings/page'

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

  it('links the Referral Program page under Reports & Finance', () => {
    // Importing the page is half the assertion: a nav entry pointing at a
    // route that does not exist is the RC-025 class of bug, and it renders
    // as a working-looking link right up until somebody clicks it.
    expect(ReferralSettingsPage).toBeTypeOf('function')

    renderSidebar()
    const finance = screen.getByRole('button', { name: 'Reports & Finance' }).closest('div') as HTMLElement
    fireEvent.mouseEnter(finance)

    expect(screen.getByRole('link', { name: 'Referral Program' })).toHaveAttribute(
      'href',
      '/admin/referral-settings',
    )
  })

  it('hides the newly-restricted surfaces from a plain ADMIN (RC-034 follow-up)', () => {
    // `team-members` and `reports` moved into the super-admin list on
    // 2026-09-24. This is the nav half of that decision — the layout's page
    // guard reads the same predicate, but the nav is what a standard ADMIN
    // actually sees first, so pin both directions here.
    renderSidebar({ role: 'ADMIN' })

    const teamSupport = screen
      .getByRole('button', { name: 'Team & Support' })
      .closest('div') as HTMLElement
    fireEvent.mouseEnter(teamSupport)
    expect(screen.queryByRole('link', { name: 'Team Members' })).not.toBeInTheDocument()
    // …while the support inboxes it shares a group with are untouched.
    expect(screen.getByRole('link', { name: 'Support Tickets' })).toBeInTheDocument()
    fireEvent.mouseLeave(teamSupport)

    // Every child of Reports & Finance is super-admin-only now — `reports` was
    // the last standard-admin entry in the group — so the Sidebar drops the
    // group entirely (it filters out empty groups). Asserted so the group's
    // disappearance is a recorded consequence, not a surprise.
    expect(
      screen.queryByRole('button', { name: 'Reports & Finance' }),
    ).not.toBeInTheDocument()
  })

  it('keeps Team Members, Overview and GST Reports for a SUPER_ADMIN', () => {
    renderSidebar({ role: 'SUPER_ADMIN' })

    const teamSupport = screen
      .getByRole('button', { name: 'Team & Support' })
      .closest('div') as HTMLElement
    fireEvent.mouseEnter(teamSupport)
    expect(screen.getByRole('link', { name: 'Team Members' })).toBeInTheDocument()
    fireEvent.mouseLeave(teamSupport)

    const finance = screen
      .getByRole('button', { name: 'Reports & Finance' })
      .closest('div') as HTMLElement
    fireEvent.mouseEnter(finance)
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GST Reports' })).toBeInTheDocument()
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
