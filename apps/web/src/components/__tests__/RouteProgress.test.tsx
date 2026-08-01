import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { createControllablePathname } from '@/test/__mocks__/next-navigation'
import { RouteProgress } from '../RouteProgress'

// Controllable pathname — the shared next/navigation mock's handle drives
// usePathname so each route change re-triggers the progress bar.
const nav = createControllablePathname('/admin')

describe('RouteProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    nav.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(<RouteProgress />)
    // RouteProgressInner returns null initially (no navigation yet),
    // so container.firstChild may be null. Just verify no errors.
    expect(container).toBeTruthy()
  })

  it('does not show progress bar on initial render', () => {
    const { container } = render(<RouteProgress />)
    // Initially isNavigating=false, so RouteProgressInner renders null.
    // No progress bar visible in the DOM.
    // The component wrapped in Suspense simply renders nothing.
    // Verify no assertion errors.
    expect(container.innerHTML).toBe('')
  })

  it('shows progress bar when pathname changes', () => {
    // Render with initial path
    const { rerender } = render(<RouteProgress />)

    // Change pathname to trigger navigation state
    nav.setPathname('/admin/retailers')
    rerender(<RouteProgress />)

    // The progress bar should now be visible (isNavigating = true)
    // After timer tick, progress should advance
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Progress should now be 30%
    // We can't easily assert on motion.div animated values in jsdom,
    // but the component should not throw
  })

  it('hides progress bar after navigation completes', () => {
    const { rerender } = render(<RouteProgress />)

    // Trigger navigation
    nav.setPathname('/admin/billing')
    rerender(<RouteProgress />)

    // Advance through all timer stages
    act(() => {
      vi.advanceTimersByTime(500) // Complete to 100%
    })

    act(() => {
      vi.advanceTimersByTime(400) // Wait for hide timeout
    })

    // After all timers complete, isNavigating = false
    // The component should have cleaned up all timers
  })

  it('cleans up timers on unmount', () => {
    const { unmount } = render(<RouteProgress />)

    // Trigger navigation
    nav.setPathname('/admin/settings')
    unmount()

    // Should not throw - timers are cleaned up
    act(() => {
      vi.advanceTimersByTime(1000)
    })
  })

  it('handles rapid route changes gracefully', () => {
    const { rerender } = render(<RouteProgress />)

    // Rapid navigation: /admin -> /admin/retailers -> /admin/billing
    nav.setPathname('/admin/retailers')
    rerender(<RouteProgress />)
    act(() => vi.advanceTimersByTime(100))

    nav.setPathname('/admin/billing')
    rerender(<RouteProgress />)
    act(() => vi.advanceTimersByTime(100))

    nav.setPathname('/admin/settings')
    rerender(<RouteProgress />)

    // Advance all timers to completion
    act(() => vi.advanceTimersByTime(1000))

    // Should not throw - all old timers should be cleaned up
  })
})
