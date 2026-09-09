import { router, type Href } from 'expo-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  emitAuthChange,
  setAuthChangeListener,
} from './auth-events'
import { clearRequestCache, getToken } from './api'
import { deleteItem, getItem } from './storage'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  /** Session state — 'loading' until the stored token has been hydrated. */
  status: AuthStatus
  /** True once a token is present AND hydrated (guards for authed routes). */
  isAuthenticated: boolean
  /**
   * True when the current session is one of Kanchuki's OWN internal agents
   * (TeamMember — email+phone OTP, team JWT, /team/* routes → app/staff).
   * NOT the retailer's shop employees: those are `isShopStaff` and use the
   * same retailer tab UI as the owner, gated by role.
   */
  isTeamMember: boolean
  /**
   * True when the current session is the retailer's own shop employee
   * (Staff row — Supabase session, scoped by staffCanAccess to the owner's
   * catalog). Rendered inside the retailer (tabs) with role-based gating.
   */
  isShopStaff: boolean
  /** The Staff/TeamMember role string ('manager' | 'salesperson' | TeamRole), null for the owner. */
  staffRole: string | null
  /** Clear every auth-related key and flip the guards to logged-out. */
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTH_KEYS = [
  'auth_token',
  'refresh_token',
  'retailer_id',
  'staff_role',
  'staff_name',
  'staff_retailer_id',
  'staff_kind',
  'admin_key',
] as const

/**
 * Derive the shop-staff vs internal-agent split from storage. `staff_kind`
 * ('shop' | 'team') is written by completeLogin since 2026-09-09; sessions
 * that predate it only have staff_role + (shop) staff_retailer_id, so fall
 * back to: staff_retailer_id present → shop staff, absent → internal agent.
 */
async function readStaffContext(): Promise<{
  staffRole: string | null
  isTeamMember: boolean
  isShopStaff: boolean
}> {
  const [role, kind, staffRetailerId] = await Promise.all([
    getItem('staff_role').catch(() => null),
    getItem('staff_kind').catch(() => null),
    getItem('staff_retailer_id').catch(() => null),
  ])
  const isShopStaff =
    Boolean(role) && (kind === 'shop' || (kind === null && Boolean(staffRetailerId)))
  return {
    staffRole: role,
    isTeamMember: Boolean(role) && !isShopStaff,
    isShopStaff,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [isTeamMember, setIsTeamMember] = useState(false)
  const [isShopStaff, setIsShopStaff] = useState(false)
  const [staffRole, setStaffRole] = useState<string | null>(null)
  // State (not a ref) so setting it re-renders and the navigation effect
  // below re-evaluates even when `status` was already 'authenticated'.
  const [pendingNav, setPendingNav] = useState<string | null>(null)

  // Hydrate the session from storage once on mount. Bounded by a timeout —
  // SecureStore.getItemAsync can hang on some Android Keystore states, and
  // the Stack must never mount with an unresolved auth state (an all-guards-
  // false navigator has zero routeNames and crashes on getInitialState).
  useEffect(() => {
    let cancelled = false
    const hydrate = (async () => {
      const token = await getToken().catch(() => null)
      if (cancelled) return
      if (!token) {
        setStatus('unauthenticated')
        return
      }
      const staff = await readStaffContext()
      if (cancelled) return
      setStaffRole(staff.staffRole)
      setIsTeamMember(staff.isTeamMember)
      setIsShopStaff(staff.isShopStaff)
      setStatus('authenticated')
    })()
    // If the SecureStore read never settles, treat it as logged-out (matches
    // the old imperative redirect's catch → /auth/phone fallback). The hydrate
    // promise is still racing underneath and will flip to authenticated if the
    // token read eventually resolves — eventual truth wins.
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 3000),
    )
    void Promise.race([hydrate, timeout]).then(() => {
      if (cancelled) return
      setStatus((prev) => (prev === 'loading' ? 'unauthenticated' : prev))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // React to auth changes emitted by the non-React layers (completeLogin,
  // signOut, redirectToAuth). On authed:true the storage writes have ALREADY
  // landed (completeLogin persists before emitting), so re-read them here to
  // learn which landing the guards need (retailer block vs staff block).
  useEffect(() => {
    setAuthChangeListener((change) => {
      if (change.authed === false) {
        setPendingNav(null)
        setIsTeamMember(false)
        setIsShopStaff(false)
        setStaffRole(null)
        setStatus('unauthenticated')
        return
      }
      setPendingNav(change.navigateTo ?? null)
      void (async () => {
        const token = await getToken().catch(() => null)
        const staff = await readStaffContext()
        setStaffRole(staff.staffRole)
        setIsTeamMember(staff.isTeamMember)
        setIsShopStaff(staff.isShopStaff)
        setStatus(token ? 'authenticated' : 'unauthenticated')
      })()
    })
    return () => setAuthChangeListener(null)
  }, [])

  // A pending destination (e.g. '/onboarding' for a new retailer) can only be
  // navigated once the guards have flipped — before that the route is not in
  // routeNames and the NAVIGATE action is ignored.
  useEffect(() => {
    if (status !== 'authenticated' || !pendingNav) return
    const dest = pendingNav
    setPendingNav(null)
    router.navigate(dest as Href)
  }, [status, pendingNav])

  const signOut = useCallback(async () => {
    await Promise.all(AUTH_KEYS.map((key) => deleteItem(key)))
    clearRequestCache()
    emitAuthChange({ authed: false })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      isTeamMember,
      isShopStaff,
      staffRole,
      signOut,
    }),
    [status, isTeamMember, isShopStaff, staffRole, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}