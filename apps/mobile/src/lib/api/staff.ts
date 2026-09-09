import { request } from './client'

// ─── Staff / Team (F-009) ────────────────────────────────────────

// Invite lifecycle (staff-invite-tokens.md §6.3) — GET /v1/staff carries the
// live invite status per member so the screen can render "Invite sent ·
// expires …" / "Invite expired · Resend" chips. pending past expiry is
// derived to 'expired' server-side; joined members (auth_user_id set) get
// invite: null. (Named StaffInviteState — StaffInviteStatus is already the
// string union in staff-invite.ts for the public join API.)
export type StaffInviteState = {
  status: 'pending' | 'expired' | 'used' | 'revoked'
  expires_at: string
}

export type StaffMember = {
  id: string
  name: string
  phone: string
  role: 'owner' | 'manager' | 'salesperson'
  is_active: boolean
  created_at: string
  // null = never logged in; set = member joined and logs in by phone alone.
  auth_user_id: string | null
  // The live invite row for a never-joined member (null once joined).
  invite: StaffInviteState | null
}

// Tokenized invite (docs/tasks/staff-invite-tokens.md §5.1) — the response to
// a staff CREATE (and RESEND) carries a shareable invite link when the member
// has never logged in. The invite block is absent for already-joined members.
export type StaffInvitePayload = {
  url: string
  expires_at: string
}

// The POST /v1/staff response: the member row PLUS the minted shareable link
// (invite is the payload there — url + expiry — NOT the list-row state shape).
export type StaffCreateResult = Omit<StaffMember, 'invite'> & {
  invite?: StaffInvitePayload
}

export const staffApi = {
  list: () => request<{ data: StaffMember[] }>('/v1/staff', { getCacheTtlMs: 15_000 }),

  create: (data: { name: string; phone: string; role?: string }) =>
    request<{ data: StaffCreateResult }>('/v1/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // staff-invite-tokens.md §5.2 — fresh link for a member who never joined.
  // 409 ALREADY_JOINED server-side if the member has already logged in.
  resendInvite: (id: string) =>
    request<{ data: { invite: StaffInvitePayload } }>(`/v1/staff/${id}/invite/resend`, {
      method: 'POST',
    }),

  update: (
    id: string,
    data: { name?: string; phone?: string; role?: string; is_active?: boolean },
  ) =>
    request<{ data: StaffMember }>(`/v1/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/v1/staff/${id}`, { method: 'DELETE' }),

  // FR-4.4 (DPDP erasure): hard-deletes the row after the 'type DELETE'
  // confirm. Blocked server-side while the member is still active.
  purge: (id: string) => request<void>(`/v1/staff/${id}?purge=true`, { method: 'DELETE' }),
}
