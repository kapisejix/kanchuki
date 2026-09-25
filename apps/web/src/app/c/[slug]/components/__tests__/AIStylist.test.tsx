import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIStylist } from '../AIStylist'

// The AI Stylist sheet is a `position: fixed` overlay whose input sits in a
// footer *outside* the scrollable body. iOS Safari does not reflow fixed
// surfaces for the keyboard, so the input the shopper is typing into ends up
// behind it — unless the overlay applies the visual-viewport inset.
//
// These tests are that mechanism: they stub a shrinking visual viewport and
// assert the overlay's padding and the panel's cap follow it, and that the
// closed-keyboard layout is left completely untouched.

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt?: string | null; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}))

type Listener = () => void

const VIEWPORT_HEIGHT = 844
const KEYBOARD_HEIGHT = 336

const originalInnerHeight = window.innerHeight

/** A stand-in `window.visualViewport` whose keyboard can be opened and closed. */
function installVisualViewport() {
  const listeners = new Map<string, Set<Listener>>()
  const state = { height: VIEWPORT_HEIGHT, offsetTop: 0 }

  const viewport = {
    get height() {
      return state.height
    },
    get offsetTop() {
      return state.offsetTop
    },
    scale: 1,
    addEventListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener)
    },
  }

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: VIEWPORT_HEIGHT,
  })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    writable: true,
    value: viewport,
  })

  return {
    count: (type: string) => listeners.get(type)?.size ?? 0,
    setKeyboard(open: boolean) {
      state.height = open ? VIEWPORT_HEIGHT - KEYBOARD_HEIGHT : VIEWPORT_HEIGHT
      act(() => {
        for (const listener of Array.from(listeners.get('resize') ?? [])) listener()
      })
    },
  }
}

/**
 * The overlay and the panel it hosts, or a loud failure if the sheet isn't
 * open. `<Sheet>` renders the overlay as the dialog and the panel as its only
 * child — see `@/components/Sheet`.
 */
function sheet() {
  const overlay = document.querySelector<HTMLElement>('[role="dialog"]')
  const panel = overlay?.firstElementChild ?? null
  if (!overlay || !(panel instanceof HTMLElement)) throw new Error('AI Stylist sheet is not open')
  return { panel, overlay }
}

function openSheet() {
  fireEvent.click(screen.getByLabelText('Open AI Stylist'))
}

describe('AIStylist keyboard inset', () => {
  let fake: ReturnType<typeof installVisualViewport>

  beforeEach(() => {
    fake = installVisualViewport()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    })
    delete (window as unknown as { visualViewport?: unknown }).visualViewport
  })

  it('lifts the sheet and caps the panel by the keyboard height', () => {
    render(<AIStylist storeSlug="meera-sarees" storeName="Meera Sarees" />)
    openSheet()

    const { panel, overlay } = sheet()
    expect(overlay.style.paddingBottom).toBe('')
    expect(panel.style.maxHeight).toBe('')

    fake.setKeyboard(true)

    // The footer input cannot be scrolled into view by the panel's own
    // scrolling, so the overlay itself has to move.
    expect(sheet().overlay.style.paddingBottom).toBe(`${KEYBOARD_HEIGHT}px`)
    // 85vh is measured against the full layout viewport; keeping it as-is would
    // push the header (and the close button) off the top of the screen.
    expect(sheet().panel.style.maxHeight).toBe(`calc(85vh - ${KEYBOARD_HEIGHT}px)`)
  })

  it('restores the untouched layout when the keyboard closes', () => {
    render(<AIStylist storeSlug="meera-sarees" storeName="Meera Sarees" />)
    openSheet()

    fake.setKeyboard(true)
    fake.setKeyboard(false)

    const { panel, overlay } = sheet()
    expect(overlay.style.paddingBottom).toBe('')
    expect(panel.style.maxHeight).toBe('')
    expect(panel.className).toContain('max-h-[85vh]')
  })

  it('subscribes to the visual viewport only while the sheet is open', () => {
    render(<AIStylist storeSlug="meera-sarees" storeName="Meera Sarees" />)

    // Closed: the host button is mounted on every storefront page view, and a
    // shopper who never opens the sheet should cost the page no listeners.
    expect(fake.count('resize')).toBe(0)
    expect(fake.count('scroll')).toBe(0)

    openSheet()

    expect(fake.count('resize')).toBe(1)
    expect(fake.count('scroll')).toBe(1)
  })
})
