import { router } from 'expo-router'
import { emitAuthChange } from './auth-events'
import { getItem, deleteItem } from './storage'
import { clearToken, clearRequestCache } from './api'

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001'

class TeamApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'TeamApiError'
  }
}

async function teamRequest<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const adminKey = await getItem('admin_key')
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }
  if (adminKey) {
    headers['x-admin-key'] = adminKey
  } else {
    const token = await getItem('auth_token')
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    })

    if (!res.ok) {
      if (res.status === 401) {
        await clearToken()
        await deleteItem('auth_token')
        await deleteItem('staff_role')
        await deleteItem('staff_name')
        await deleteItem('staff_retailer_id')
        clearRequestCache()
        // Flip the guards — auth/phone becomes the only route. The replace is
        // a best-effort fallback when the AuthProvider isn't mounted yet.
        emitAuthChange({ authed: false })
        router.replace('/auth/phone')
      }
      const body = await res.json().catch(() => ({ error: { message: 'Request failed' } }))
      throw new TeamApiError(
        body.error?.code ?? 'TEAM_ERROR',
        body.error?.message ?? `Request failed (${res.status})`,
        res.status,
      )
    }

    return (await res.json()) as T
  } catch (err) {
    if (err instanceof TeamApiError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TeamApiError('TIMEOUT', 'Request timed out', 408)
    }
    throw new TeamApiError('NETWORK_ERROR', err instanceof Error ? err.message : 'Network error', 0)
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Types ──────────────────────────────────────────────────────

export type TeamMemberInfo = {
  id: string
  name: string
  email: string
  role: string
  territories: { id: string; name: string; level: string }[]
}

export type SupportTicket = {
  id: string
  retailer_id: string
  requires_visit: boolean
  region_scope_id: string | null
  assigned_to_id: string | null
  status: 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'CLOSED'
  note: string | null
  created_at: string
  resolved_at: string | null
  assigned_to: { id: string; name: string } | null
  retailer: { id: string; shop_name: string; city: string; phone: string }
  ticket_type: 'GENERAL' | 'CATALOG_UPLOAD'
  item_count_requested: number | null
  quoted_price_inr: number | null
  proposed_slots: string[] | null
  confirmed_slot: string | null
  paid_at: string | null
}

export type SupportTicketStats = {
  open: number
  assigned: number
  resolved: number
  closed: number
  total: number
  requires_visit: number
}

export type TerritoryRetailer = {
  id: string
  shop_name: string
  phone: string
  city: string
  territory_id: string | null
  onboarded_by_id: string | null
  support_owner_id: string | null
  plan_status: string
  created_at: string
}

// ─── API Methods ────────────────────────────────────────────────

export const teamApi = {
  /** Get current staff member profile with territories */
  getMe: () => teamRequest<{ data: TeamMemberInfo }>('/v1/team/me'),

  /** List retailers scoped to the staff member's territory */
  getRetailers: () =>
    teamRequest<{ data: TerritoryRetailer[] }>('/v1/team/retailers'),

  /** Quick onboard a retailer in the field */
  onboardRetailer: (data: {
    phone: string
    shop_name: string
    owner_name?: string
    city: string
    state?: string
    pincode?: string
    categories?: string[]
    territory_id?: string
  }) =>
    teamRequest<{ data: { retailer: TerritoryRetailer; over_capacity: boolean } }>(
      '/v1/team/retailers',
      { method: 'POST', body: JSON.stringify(data), timeoutMs: 30_000 },
    ),

  /** List support tickets, optionally filtered by ticket_type */
  getTickets: (params?: { ticket_type?: 'GENERAL' | 'CATALOG_UPLOAD' }) =>
    teamRequest<{ data: SupportTicket[] }>(
      params?.ticket_type
        ? `/v1/team/tickets?ticket_type=${params.ticket_type}`
        : '/v1/team/tickets',
    ),

  /** F-020: mint a delegated, ticket-scoped session token to upload this
   * retailer's catalog from the assigned team member's own phone. */
  startCatalogSession: (ticketId: string) =>
    teamRequest<{ data: { token: string; expires_in_seconds: number } }>(
      `/v1/team/tickets/${ticketId}/catalog-session`,
      { method: 'POST' },
    ),

  /** Get support ticket stats */
  getTicketStats: () =>
    teamRequest<{ data: SupportTicketStats }>('/v1/team/tickets/stats'),

  /** Update a support ticket */
  updateTicket: (
    id: string,
    data: {
      status?: string
      assigned_to_id?: string | null
      note?: string
    },
  ) =>
    teamRequest<{ data: SupportTicket }>(`/v1/team/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
}
