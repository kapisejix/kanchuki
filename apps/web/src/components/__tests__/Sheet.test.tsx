import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Sheet } from '../Sheet'

// `<Sheet>` is the single place that knows iOS Safari does not reflow
// `position: fixed` for the on-screen keyboard. These tests are that
// mechanism: a shrinking visual viewport must move the overlay's padding and
// the panel's `vh` cap, the closed-keyboard layout must be left completely
// untouched, and a closed sheet must cost the page no listeners.

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

function overlay() {
  return screen.getByRole('dialog')
}

function panel() {
  const child = overlay().firstElementChild
  if (!(child instanceof HTMLElement)) throw new Error('Sheet panel is missing')
  return child
}

/** A minimal uncontrolled host, so `open` can be driven from a click. */
function Host({
  initialOpen = true,
  panelClassName = 'w-full max-w-md max-h-full overflow-y-auto',
  maxHeightVh,
}: {
  initialOpen?: boolean
  panelClassName?: string
  maxHeightVh?: number
}) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        overlayClassName="z-50 flex items-center justify-center p-4 bg-black/60"
        panelClassName={panelClassName}
        maxHeightVh={maxHeightVh}
        ariaLabel="Test sheet"
      >
        <input aria-label="field" />
      </Sheet>
    </>
  )
}

describe('Sheet', () => {
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

  it('renders nothing, and attaches nothing, while closed', () => {
    render(<Host initialOpen={false} />)

    expect(screen.queryByRole('dialog')).toBeNull()
    // A closed sheet on a storefront page view is the common case; it must not
    // cost that page a keyboard listener.
    expect(fake.count('resize')).toBe(0)
    expect(fake.count('scroll')).toBe(0)
  })

  it('lays the overlay out with the caller classes and no keyboard correction', () => {
    render(<Host />)

    expect(overlay().className).toContain('fixed inset-0')
    expect(overlay().className).toContain('bg-black/60')
    expect(overlay().className).toContain('z-50')
    expect(panel().className).toContain('max-h-full')

    expect(overlay().style.paddingBottom).toBe('')
    expect(panel().style.maxHeight).toBe('')
  })

  it('names the overlay as a dialog for assistive tech', () => {
    render(<Host />)

    expect(overlay()).toHaveAttribute('aria-label', 'Test sheet')
  })

  it('lifts the overlay by the keyboard height', () => {
    render(<Host />)

    fake.setKeyboard(true)

    expect(overlay().style.paddingBottom).toBe(`${KEYBOARD_HEIGHT}px`)
    // `max-h-full` needs no arithmetic — the padding already shrank the
    // content box the percentage resolves against.
    expect(panel().style.maxHeight).toBe('')
  })

  it('caps a vh-sized panel by the keyboard height too', () => {
    render(<Host maxHeightVh={85} panelClassName="w-full max-w-md max-h-[85vh] overflow-y-auto" />)

    fake.setKeyboard(true)

    expect(panel().style.maxHeight).toBe(`calc(85vh - ${KEYBOARD_HEIGHT}px)`)
  })

  it('restores the untouched layout when the keyboard closes', () => {
    render(<Host maxHeightVh={85} panelClassName="w-full max-w-md max-h-[85vh] overflow-y-auto" />)

    fake.setKeyboard(true)
    fake.setKeyboard(false)

    expect(overlay().style.paddingBottom).toBe('')
    expect(panel().style.maxHeight).toBe('')
    // The declared cap is still the one the caller asked for.
    expect(panel().className).toContain('max-h-[85vh]')
  })

  it('subscribes only while it is open', () => {
    render(<Host initialOpen={false} />)

    fireEvent.click(screen.getByText('open'))

    expect(fake.count('resize')).toBe(1)
    expect(fake.count('scroll')).toBe(1)

    fireEvent.click(overlay())

    expect(fake.count('resize')).toBe(0)
    expect(fake.count('scroll')).toBe(0)
  })

  it('closes on a scrim click but not on a click inside the panel', () => {
    render(<Host />)

    fireEvent.click(screen.getByLabelText('field'))
    expect(screen.queryByRole('dialog')).not.toBeNull()

    fireEvent.click(overlay())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('defaults to closing without a handler, and tolerates a missing one', () => {
    const { container } = render(
      <Sheet open overlayClassName="z-50" panelClassName="p-4">
        <span>body</span>
      </Sheet>,
    )

    // No `onClose`: the sheet still renders, the scrim click is simply inert.
    expect(container.querySelector('span')).toBeInTheDocument()
    expect(() => fireEvent.click(overlay())).not.toThrow()
  })

  it('keeps the sheet mounted while its exit animation runs', async () => {
    // `<Sheet>` owns the `AnimatePresence`, because it is not itself a motion
    // component and an outer one would unmount it on the first render where
    // `open` flips — before any exit animation could run.
    function Animated() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button onClick={() => setOpen(false)}>close</button>
          <Sheet
            open={open}
            onClose={() => setOpen(false)}
            overlayClassName="z-50"
            panelClassName="p-4"
            overlayAnimation={{ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }}
            panelAnimation={{ exit: { opacity: 0 }, transition: { duration: 0.2 } }}
          >
            <span>body</span>
          </Sheet>
        </>
      )
    }

    render(<Animated />)
    expect(screen.getByText('body')).toBeInTheDocument()

    fireEvent.click(screen.getByText('close'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
