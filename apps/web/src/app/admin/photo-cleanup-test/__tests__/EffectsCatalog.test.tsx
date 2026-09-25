import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EffectsCatalog from '../EffectsCatalog'

// The admin panel's other keyboard fixes are pinned structurally (see
// `app/admin/__tests__/keyboard-inset.test.ts`), which proves the styles are
// written but not that they reach a rendered element. This is the behavioural
// half, on the one admin modal that mounts without an API call: a `fixed inset-0`
// dialog holding its own text fields, which iOS Safari will not reflow.
//
// Two things are asserted that the structural guard cannot see: the styles
// actually land on the dialog and its panel, and the host — which sits in the
// tree whether or not the dialog is open — attaches no visual-viewport
// listeners while it is closed.

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
 * Opens a preset card and returns the sheet's overlay and its scrollable panel.
 * The preset dialog is a `<Sheet>` now, not a bare `<dialog>` — the overlay is
 * the element carrying `role="dialog"`, and the panel is its only child.
 */
function openPresetDialog() {
  const buttons = () => Array.from(document.querySelectorAll('button'))

  // The catalogue is collapsed by default, so the cards below aren't in the
  // tree until its header toggle — the first button — is clicked.
  const toggle = buttons()[0]
  if (!toggle) throw new Error('catalogue toggle not rendered')
  fireEvent.click(toggle)

  // Preset cards are distinguished from the sample tiles (which also wrap a
  // preview <img>) by their `combo` / `fixed` chip.
  const card = buttons().find((b) => /combo|fixed/.test(b.textContent ?? ''))
  if (!card) throw new Error('no preset card rendered')
  fireEvent.click(card)

  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
  const panel = dialog?.firstElementChild as HTMLElement | null | undefined
  if (!dialog || !panel) throw new Error('preset dialog is not open')
  return { dialog, panel }
}

describe('EffectsCatalog preset dialog keyboard inset', () => {
  let fake: ReturnType<typeof installVisualViewport>

  beforeEach(() => {
    fake = installVisualViewport()
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    })
    delete (window as unknown as { visualViewport?: unknown }).visualViewport
  })

  it('leaves the closed layout untouched and subscribes to nothing', () => {
    render(<EffectsCatalog onUse={() => {}} />)

    // The catalogue is the page; the dialog is the exception. A visit that never
    // opens a preset must not pay for visual-viewport listeners.
    expect(fake.count('resize')).toBe(0)
    expect(fake.count('scroll')).toBe(0)

    const { dialog, panel } = openPresetDialog()
    expect(dialog.style.paddingBottom).toBe('')
    expect(panel.style.maxHeight).toBe('')
    // The dialog is open, so the inset is now being watched.
    expect(fake.count('resize')).toBe(1)
  })

  it('lifts the dialog and caps the panel by the keyboard height', () => {
    render(<EffectsCatalog onUse={() => {}} />)
    const { dialog, panel } = openPresetDialog()

    fake.setKeyboard(true)

    expect(dialog.style.paddingBottom).toBe(`${KEYBOARD_HEIGHT}px`)
    // 92vh is measured against the full layout viewport; keeping it as-is while
    // the dialog is lifted would push its head off the top of the screen.
    expect(panel.style.maxHeight).toBe(`calc(92vh - ${KEYBOARD_HEIGHT}px)`)
  })

  it('restores the untouched layout when the keyboard closes', () => {
    render(<EffectsCatalog onUse={() => {}} />)
    const { dialog, panel } = openPresetDialog()

    fake.setKeyboard(true)
    fake.setKeyboard(false)

    expect(dialog.style.paddingBottom).toBe('')
    expect(panel.style.maxHeight).toBe('')
    expect(panel.className).toContain('max-h-[92vh]')
  })
})
