/**
 * Dependency-free bridge between the non-React layers (api client, team-api)
 * and the AuthProvider's React state.
 *
 * The API layer can't call React hooks, and the auth context must not import
 * the API client (circular module dependency). This registry lets either side
 * of that boundary signal an auth-state change:
 *
 *   - completeLogin / signOut emit { authed: true/false } after writing
 *     storage, and the provider re-hydrates + flips the Stack.Protected guards.
 *   - client.ts's redirectToAuth() (401 handler) emits { authed: false } when
 *     the session dies mid-request, so the guards drop the authenticated
 *     screens and auth/phone becomes the only route.
 *
 * `navigateTo` lets the emitter request a navigation once the guards have
 * flipped (the provider owns the navigation, so it never races the
 * routeNames recompute). e.g. a brand-new retailer → '/onboarding'.
 */
export type AuthChange = {
  authed: boolean
  /** Optional destination to navigate to AFTER the guards flip. */
  navigateTo?: string
}

type Listener = (change: AuthChange) => void

let listener: Listener | null = null

/** Register the single auth-state listener (the AuthProvider). */
export function setAuthChangeListener(fn: Listener | null): void {
  listener = fn
}

/** Emit an auth-state change to the provider (no-op when not mounted). */
export function emitAuthChange(change: AuthChange): void {
  listener?.(change)
}