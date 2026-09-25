// iOS Safari does not reflow `position: fixed` for the on-screen keyboard.
//
// When the keyboard opens, the layout viewport keeps its full height — the
// keyboard simply paints over the bottom of it — so anything bottom-anchored
// inside a fixed overlay ends up behind the keyboard with no way to scroll to
// it. Normal in-flow content is unaffected (the document scrolls instead),
// which is why every page-level form in the customer web is fine as-is and only
// the fixed sheets need this.
//
// `dvh`/`svh` do not help: they track the browser's own chrome (the address
// bar collapsing), not the keyboard. The *visual* viewport does shrink, so its
// size is the only reliable measurement — this module turns it into a bottom
// inset the overlay applies itself.
//
// Verified shape this exists for: `AIStylist` — fixed overlay → bottom-anchored
// panel → scrollable body → input in a footer *outside* the scroll region, so
// the input cannot be scrolled into view by the panel's own scrolling.
// `CustomerConsentModal` deliberately has no separate footer (its inputs scroll
// with the panel) and needs none of this.

import { useEffect, useState } from 'react'

/** The subset of `window.visualViewport` we rely on. */
export interface VisualViewportLike {
  /** Height of the visual viewport, in CSS pixels. */
  height: number
  /** Offset of its top edge from the layout viewport, in CSS pixels. */
  offsetTop: number
  /** Pinch-zoom factor; 1 means not zoomed. */
  scale?: number
}

type EventTargetLike = {
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/** The slice of `window` this module reads, so a test can pass a stand-in. */
export interface KeyboardSource extends EventTargetLike {
  innerHeight: number
  visualViewport?: (EventTargetLike & VisualViewportLike) | null
}

/**
 * How much of the layout viewport the keyboard is covering, in CSS pixels.
 *
 * 0 when the keyboard is closed, and 0 whenever we cannot tell — a missing
 * measurement must leave the overlay laid out exactly as it was before this
 * module existed rather than guessing at a padding.
 */
export function computeKeyboardInset(
  innerHeight: number,
  viewport: VisualViewportLike | null | undefined,
): number {
  // No `visualViewport` at all: SSR, or a browser that never supported it.
  if (!viewport) return 0
  if (!Number.isFinite(innerHeight) || !Number.isFinite(viewport.height)) return 0

  // A pinch-zoom shrinks `height` for a reason that has nothing to do with the
  // keyboard, and the arithmetic below is only exact at scale 1 — the two
  // cannot be told apart from these numbers alone. Shifting the whole panel up
  // by a zoom-sized inset looks far more broken than leaving it put, so a
  // zoomed viewport reports "no keyboard". `app/layout.tsx` sets
  // `maximumScale: 1`, which covers iOS's automatic zoom-on-focus (the one
  // raised by tapping a small-text input); a deliberate pinch is the only way
  // to reach this branch, and pinching back restores the inset.
  if ((viewport.scale ?? 1) > 1) return 0

  // `offsetTop` grows when iOS scrolls the visual viewport to reveal the
  // focused input; the keyboard still occupies the same slice of the layout
  // viewport, so subtracting the offset keeps the measurement stable.
  const offsetTop = Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0
  const hidden = innerHeight - (viewport.height + offsetTop)

  // Negative while the keyboard animates, and whenever the visual viewport is
  // momentarily reported as larger than the layout viewport. Clamp rather than
  // hand a negative padding to the layout.
  return hidden > 0 ? Math.round(hidden) : 0
}

/** Read the current inset from a window-like source (0 when there is none). */
export function readKeyboardInset(source?: KeyboardSource | null): number {
  if (!source) return 0
  return computeKeyboardInset(source.innerHeight, source.visualViewport ?? null)
}

function resolveSource(source?: KeyboardSource | null): KeyboardSource | null {
  if (source) return source
  return typeof window === 'undefined' ? null : (window as unknown as KeyboardSource)
}

/**
 * Call `onChange` with the current inset whenever the keyboard opens, closes,
 * resizes or slides the viewport. Fires once on subscribe, so an overlay that
 * mounts while the keyboard is already up gets the right value immediately
 * instead of waiting for the next event.
 *
 * @returns an unsubscribe function — a no-op without a window, so SSR cannot throw.
 */
export function subscribeKeyboardInset(
  onChange: (inset: number) => void,
  source?: KeyboardSource | null,
): () => void {
  const target = resolveSource(source)
  if (!target) return () => {}

  const update = () => onChange(readKeyboardInset(target))

  // `resize` on the visual viewport is the keyboard itself opening/closing (and
  // rotation); `scroll` is Safari sliding the visual viewport once the keyboard
  // is up. The window events are a cheap fallback for engines that change the
  // layout viewport instead of the visual one.
  const vv = target.visualViewport
  vv?.addEventListener('resize', update)
  vv?.addEventListener('scroll', update)
  target.addEventListener('resize', update)
  target.addEventListener('orientationchange', update)

  update()

  return () => {
    vv?.removeEventListener('resize', update)
    vv?.removeEventListener('scroll', update)
    target.removeEventListener('resize', update)
    target.removeEventListener('orientationchange', update)
  }
}

/**
 * The inset a fixed overlay should apply as `paddingBottom`, re-read on every
 * keyboard/viewport change.
 *
 * Pass `enabled: false` to keep the listeners detached while the overlay is
 * closed: this hook's host is mounted on every storefront page view, and a
 * closed sheet should cost a storefront nothing.
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setInset(0)
      return
    }
    return subscribeKeyboardInset(setInset)
  }, [enabled])

  return inset
}
