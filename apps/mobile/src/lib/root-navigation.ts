import { CommonActions } from '@react-navigation/native'
import type { NavigationContainerRef } from '@react-navigation/native'

/**
 * Replace the ENTIRE root navigation state with one destination screen.
 *
 * Why this exists: `router.replace()` in expo-router only swaps the *focused*
 * route inside the current navigator. The auth flow cold-starts into
 * auth/phone (a root-Stack route), then pushes auth/otp on top of it — so
 * auth/phone ends up at the BOTTOM of the root stack. Replacing auth/otp with
 * (tabs) therefore leaves auth/phone *beneath* the dashboard. On Android that
 * means a single hardware back-press pops natively to the Login screen before
 * the dashboard's double-tap-to-exit BackHandler even gets a chance to run.
 *
 * Dispatching a root-level `CommonActions.reset` makes the destination the
 * ONLY screen in the stack — the correct semantics for "logged in once ⇒ back
 * stays on the dashboard; double-tap back closes the app". The same applies to
 * onboarding→dashboard (onboarding must not linger beneath tabs) and to
 * logout (the login screen must not sit on top of a stale authenticated stack).
 *
 * @returns true when the reset was dispatched; false when the navigator isn't
 * mounted yet — callers should fall back to `router.replace` in that case.
 */
export function resetRootTo(
  rootNavigation: NavigationContainerRef<ReactNavigation.RootParamList> | null,
  routeName: string,
): boolean {
  if (!rootNavigation?.isReady()) return false
  rootNavigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: routeName }],
    }),
  )
  return true
}
