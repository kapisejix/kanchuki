import { KeyboardAvoidingView, Platform, type KeyboardAvoidingViewProps } from 'react-native'

/**
 * Platform behaviour for keeping the focused input above the software keyboard.
 *
 * iOS does not resize the layout viewport for the keyboard, so the container
 * has to add bottom padding itself (`'padding'`). Android resizes the layout
 * viewport and reports it through `height` on the window, so the container
 * must SHRINK (`'height'`) — using `'padding'` there double-counts the
 * keyboard and pushes the content off-screen.
 *
 * Both platform branches are load-bearing; do not collapse this to one value.
 */
export const KEYBOARD_BEHAVIOR: NonNullable<KeyboardAvoidingViewProps['behavior']> =
  Platform.OS === 'ios' ? 'padding' : 'height'

export type KeyboardScreenProps = KeyboardAvoidingViewProps & {
  /** Layout classes for the wrapper. Defaults to filling the screen. */
  className?: string
}

/**
 * Screen-level wrapper that lifts its content above the software keyboard.
 *
 * Every screen with a `TextInput` at the top level of its layout should use
 * this instead of a raw `KeyboardAvoidingView`, so the platform behaviour is
 * decided in exactly one place. Wrap the SCREEN ROOT (or the `ScrollView` /
 * the `Modal` content) — a `KeyboardAvoidingView` only reflows its own
 * subtree, so nesting one around an unrelated branch does nothing.
 *
 * Pass `behavior` to opt out of the default; pass nothing at all if you want
 * the default. Keep the wrapper mounted while the screen is visible — it
 * subscribes to keyboard events on mount.
 */
export function KeyboardScreen({ className = 'flex-1', behavior, ...rest }: KeyboardScreenProps) {
  return (
    <KeyboardAvoidingView
      className={className}
      behavior={behavior ?? KEYBOARD_BEHAVIOR}
      {...rest}
    />
  )
}

export default KeyboardScreen
