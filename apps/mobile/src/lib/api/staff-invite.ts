import { request } from './client'

// ─── Public staff-invite (docs/tasks/staff-invite-tokens.md §5.3/5.4) ─────
// Called from the LOGGED-OUT join screen (app/join.tsx) — no session needed.
// The server owns the invite's phone number; the client only ever sees the
// masked form and a success signal.

export type StaffInviteStatus = 'pending' | 'used' | 'expired' | 'revoked'

export type StaffInviteInfo = {
  shop_name: string | null
  member_name: string
  role: string
  phone_masked: string
  status: StaffInviteStatus
}

export const staffInviteApi = {
  /** Resolve an invite token → masked join summary (404 = unknown/expired/revoked). */
  get: (token: string) =>
    request<{ data: StaffInviteInfo }>(`/v1/public/staff-invite/${encodeURIComponent(token)}`, {
      getCacheTtlMs: 0,
    }),

  /** Server sends the OTP to the invite's BOUND phone. The number never crosses the wire. */
  sendOtp: (token: string) =>
    request<{ data: { sent_to: string } }>(
      `/v1/public/staff-invite/${encodeURIComponent(token)}/otp`,
      { method: 'POST' },
    ),
}