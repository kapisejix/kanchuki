'use client'

import { AnimatePresence, motion, type MotionProps } from 'framer-motion'
import type { ReactNode } from 'react'
import { useKeyboardInset } from '@/lib/keyboard-inset'

/**
 * The motion half of a `<Sheet>`, passed straight through to the underlying
 * `motion.div`. A caller keeps whatever enter/exit motion it already had — or
 * passes nothing and gets a plain, unanimated overlay.
 */
export interface SheetAnimation {
  initial?: MotionProps['initial']
  animate?: MotionProps['animate']
  exit?: MotionProps['exit']
  transition?: MotionProps['transition']
}

export interface SheetProps {
  /**
   * Owners of the open/closed state. `<Sheet>` renders its own
   * `AnimatePresence`, so it must be mounted **unconditionally** with `open`
   * passed in — wrapping it in another `AnimatePresence` or `{open && <Sheet/>}`
   * unmounts the sheet before its exit animation can run (an `AnimatePresence`
   * only animates direct `motion` children, and `<Sheet>` is not one).
   */
  open: boolean
  /** Runs on a click on the scrim. The panel stops propagation, so a click on it never lands here. */
  onClose?: () => void
  children: ReactNode
  /**
   * Classes for the fixed overlay: scrim colour, centring, and a **z-index**.
   * The base class supplies only `fixed inset-0`, and Tailwind resolves `z-50`
   * against `z-[70]` by its own internal order rather than source order — so
   * whichever the caller names is the one that applies, and naming none leaves
   * the sheet behind the page.
   */
  overlayClassName?: string
  /** Classes for the panel: width cap, corners, and usually `overflow-y-auto`. */
  panelClassName?: string
  /**
   * Cap the panel at `N` viewport heights **minus the keyboard**. Omit it when
   * the panel uses `max-h-full`: the overlay's `paddingBottom` already shrinks
   * the overlay's content box, which a percentage cap is resolved against, so
   * `max-h-full` needs no arithmetic here. A `vh`-based cap does — it is
   * measured against the layout viewport, which the keyboard does not change.
   */
  maxHeightVh?: number
  /** Enter/exit motion for the overlay (usually a fade). */
  overlayAnimation?: SheetAnimation
  /** Enter/exit motion for the panel (usually a fade + scale/slide). */
  panelAnimation?: SheetAnimation
  /** Accessible name for the `role="dialog"` overlay, when it has no visible heading. */
  ariaLabel?: string
}

/** Module-scope so the panel's callback identity never changes under its children. */
function stopPropagation(e: React.MouseEvent) {
  e.stopPropagation()
}

/**
 * A fixed overlay plus its panel, with the iOS keyboard accounted for.
 *
 * iOS Safari does not reflow `position: fixed` for the on-screen keyboard: the
 * layout viewport keeps its full height and the keyboard simply paints over the
 * bottom of it. A bottom-anchored panel therefore ends up behind the keyboard
 * with no way to scroll to it. Every fixed overlay in the app needs the same
 * correction, which is what this component exists to apply once.
 *
 * See `@/lib/keyboard-inset` for the measurement itself and why it has to come
 * from `window.visualViewport`.
 */
export function Sheet({
  open,
  onClose,
  children,
  overlayClassName,
  panelClassName,
  maxHeightVh,
  overlayAnimation,
  panelAnimation,
  ariaLabel,
}: SheetProps) {
  // Subscribed only while open. Most hosts (a storefront page, an admin list)
  // stay mounted whether or not their sheet is, so an unconditional hook would
  // attach four visual-viewport listeners for the whole session.
  const keyboardInset = useKeyboardInset(open)

  // Shrinking the overlay's content box is the whole correction: a
  // bottom-anchored panel is lifted clear of the keyboard, and a `max-h-full`
  // panel gives back the same amount on its own because a percentage cap
  // resolves against this content box.
  //
  // `undefined` rather than `0` when there is no keyboard, so the closed-state
  // layout carries no inline style at all.
  const overlayStyle = keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined

  // A `vh` cap has to subtract the inset explicitly — see the prop's doc.
  const panelStyle =
    maxHeightVh != null && keyboardInset > 0
      ? { maxHeight: `calc(${maxHeightVh}vh - ${keyboardInset}px)` }
      : undefined

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...overlayAnimation}
          role="dialog"
          aria-label={ariaLabel}
          className={['fixed inset-0', overlayClassName].filter(Boolean).join(' ')}
          style={overlayStyle}
          onClick={onClose}
        >
          <motion.div
            {...panelAnimation}
            onClick={stopPropagation}
            className={panelClassName}
            style={panelStyle}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
