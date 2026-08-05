import { request } from './client'

export const authApi = {
  /**
   * Send OTP via Supabase Auth.
   * Uses a longer timeout (30s) because Supabase's SMS provider (Twilio) can
   * take 10–25s to deliver, especially on first call to a new phone number.
   */
  sendOtp: (phone: string) =>
    request<{ data: { message: string; phone: string } }>('/v1/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      timeoutMs: 30_000,
    }),

  /**
   * Verify OTP and get session tokens.
   * Same 30s timeout — Supabase token exchange can be slow on cold start.
   * Returns is_staff=true if the phone belongs to a staff member instead of a retailer owner.
   */
  verifyOtp: (phone: string, otp: string) =>
    request<{
      data: {
        access_token: string
        // Absent for TeamMember logins — their token is a 12h team JWT with
        // no Supabase session behind it, so there is nothing to refresh.
        refresh_token?: string
        is_staff: boolean
        retailer?: { id: string; shop_name?: string; city?: string; plan?: string; plan_status?: string; onboarding_completed?: boolean; onboarding_step?: number }
        staff?: { id: string; name: string; role: string; retailer_id: string; retailer_shop_name: string; retailer_city: string }
        // Kanchuki's own field/sales/support agent (TeamMember) logged in via
        // phone OTP — access_token is a team JWT for the /team/* routes.
        team_member?: { id: string; name: string; email: string; role: string }
        is_new?: boolean
      }
    }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
      timeoutMs: 30_000,
    }),
}
