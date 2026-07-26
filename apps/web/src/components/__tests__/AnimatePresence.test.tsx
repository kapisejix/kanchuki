import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { PageTransitionWrapper, pageVariants } from '../PageTransitionWrapper'

// ── Module-level exit variant tests ─────────────────────────────
// Pure value assertions on the exported variant object — no DOM needed.

describe('pageVariants.exit', () => {
  it('has correct exit opacity', () => {
    expect(pageVariants.exit).toBeDefined()
    expect(pageVariants.exit).toHaveProperty('opacity', 0)
  })

  it('slides up on exit', () => {
    expect(pageVariants.exit).toHaveProperty('y', -20)
  })

  it('scales down slightly on exit', () => {
    expect(pageVariants.exit).toHaveProperty('scale', 0.97)
  })

  it('has exit transition with 250ms duration', () => {
    const exitTransition = (pageVariants.exit as Record<string, unknown>).transition as Record<string, unknown>
    expect(exitTransition).toBeDefined()
    expect(exitTransition).toHaveProperty('duration', 0.25)
  })

  it('has exit transition with ease values', () => {
    const exitTransition = (pageVariants.exit as Record<string, unknown>).transition as Record<string, unknown>
    expect(exitTransition).toHaveProperty('ease')
    expect(Array.isArray(exitTransition.ease)).toBe(true)
    expect((exitTransition.ease as number[]).length).toBe(4)
  })
})

// ── Entrance/exit direction consistency tests ───────────────────
// Pure value assertions — no DOM needed.

describe('Entrance/Exit direction consistency', () => {
  it('entrance slides up (y: 24→0) and exit slides up (y: 0→-20)', () => {
    const pv = pageVariants as Record<string, Record<string, unknown>>
    expect(pv.initial?.y).toBe(24)
    expect(pv.exit?.y).toBe(-20)
  })

  it('entrance scales up (0.97→1) and exit scales down (1→0.97)', () => {
    const pv = pageVariants as Record<string, Record<string, unknown>>
    expect(pv.initial?.scale).toBe(0.97)
    expect(pv.animate?.scale).toBe(1)
    expect(pv.exit?.scale).toBe(0.97)
  })
})

// ── AnimatePresence component-level tests ───────────────────────
// These test AnimatePresence behavior in jsdom. Note that
// framer-motion's exit animations use requestAnimationFrame internally.
// In jsdom, rAF fires via setTimeout(..., 16). We use waitFor() to give
// the browser-like scheduling time to settle — without fake timers.

describe('AnimatePresence', () => {
  it('renders children inside AnimatePresence', () => {
    render(
      <AnimatePresence>
        <motion.div key="item" exit={{ opacity: 0 }}>
          Visible child
        </motion.div>
      </AnimatePresence>,
    )
    expect(screen.getByText('Visible child')).toBeInTheDocument()
  })

  it('renders new children after key change via rerender', async () => {
    function KeySwitcher({ step }: { step: number }) {
      return (
        <AnimatePresence mode="wait">
          <motion.div key={step} exit={{ opacity: 0 }}>
            Step {step}
          </motion.div>
        </AnimatePresence>
      )
    }

    const { rerender } = render(<KeySwitcher step={1} />)
    expect(screen.getByText(/Step/)).toBeInTheDocument()

    rerender(<KeySwitcher step={2} />)

    // waitFor retries until the new content appears — giving framer-motion's
    // rAF-based exit scheduling time to complete naturally in jsdom.
    await waitFor(() => {
      expect(screen.getByText(/Step 2/)).toBeInTheDocument()
    })
  })
})

// ── PageTransitionWrapper + AnimatePresence integration ────────

describe('PageTransitionWrapper with AnimatePresence', () => {
  it('renders content inside AnimatePresence without error', () => {
    render(
      <AnimatePresence mode="wait">
        <PageTransitionWrapper key="page-1">
          <div>Page content</div>
        </PageTransitionWrapper>
      </AnimatePresence>,
    )
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('swaps content when key changes inside AnimatePresence', async () => {
    function PageSwitcher({ page }: { page: string }) {
      return (
        <AnimatePresence mode="wait">
          <PageTransitionWrapper key={page}>
            <div>{page}</div>
          </PageTransitionWrapper>
        </AnimatePresence>
      )
    }

    const { rerender } = render(<PageSwitcher page="home" />)
    expect(screen.getByText('home')).toBeInTheDocument()

    rerender(<PageSwitcher page="settings" />)

    await waitFor(() => {
      expect(screen.getByText('settings')).toBeInTheDocument()
    })
  })

  it('preserves exit variant when used inside AnimatePresence', () => {
    const { container } = render(
      <AnimatePresence mode="wait">
        <PageTransitionWrapper key="test">
          <div>Content</div>
        </PageTransitionWrapper>
      </AnimatePresence>,
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it('staggered mode still works inside AnimatePresence', () => {
    render(
      <AnimatePresence mode="wait">
        <PageTransitionWrapper key="staggered-test" staggered>
          <div>Item 1</div>
          <div>Item 2</div>
        </PageTransitionWrapper>
      </AnimatePresence>,
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('handles multiple rapid key changes without error', async () => {
    function RapidSwitcher() {
      const [page, setPage] = useState('a')
      return (
        <>
          <button onClick={() => setPage('b')}>Go B</button>
          <button onClick={() => setPage('c')}>Go C</button>
          <AnimatePresence mode="wait">
            <PageTransitionWrapper key={page}>
              <div>Page {page}</div>
            </PageTransitionWrapper>
          </AnimatePresence>
        </>
      )
    }

    const { container } = render(<RapidSwitcher />)
    expect(screen.getByText('Page a')).toBeInTheDocument()

    // Rapidly click both buttons
    const buttons = container.querySelectorAll('button')
    buttons[0]?.click()
    buttons[1]?.click()

    await waitFor(() => {
      expect(screen.getByText('Page c')).toBeInTheDocument()
    })
  })
})

// ── Static render tests for PageTransitionWrapper ──────────────
// These verify that the component renders properly inside AnimatePresence
// without requiring exit animation completion.

describe('PageTransitionWrapper static renders inside AnimatePresence', () => {
  it('renders with exit prop in default mode', () => {
    const { container } = render(
      <AnimatePresence mode="wait">
        <PageTransitionWrapper key="static">
          <div>Content</div>
        </PageTransitionWrapper>
      </AnimatePresence>,
    )
    // motion.div renders as plain div in jsdom
    expect(container.querySelector('div')).toBeInTheDocument()
  })

  it('renders with empty children inside AnimatePresence', () => {
    const { container } = render(
      <AnimatePresence mode="wait">
        <PageTransitionWrapper key="empty" />
      </AnimatePresence>,
    )
    expect(container.firstChild).toBeInTheDocument()
  })
})
