import { request } from './client'

export interface VerifyOtpResult {
  access_token: string
  // Absent for TeamMember logins — their token is a 12h team JWT with no
  // Supabase session behind it, so there is nothing to refresh.
  refresh_token?: string
  is_staff: boolean
  retailer?: {
    id: string
    shop_name?: string
    city?: string
    plan?: string
    plan_status?: string
    onboarding_completed?: boolean
    onboarding_step?: number
  }
  staff?: {
    id: string
    name: string
    role: string
    retailer_id: string
    retailer_shop_name: string
    retailer_city: string
  }
  // Kanchuki's own field/sales/support agent (TeamMember) logged in via phone
  // OTP — access_token is a team JWT for the /team/* routes.
  team_member?: { id: string; name: string; email: string; role: string }
  is_new?: boolean
}

export const authApi = {
  /**
   * Send OTP via the API (legacy Supabase flow — used when the MSG91 widget
   * isn't configured in this build, and by the web billing page).
   * Uses a longer timeout (30s) because SMS delivery + the exchange can be
   * slow on a cold start.
   */
  sendOtp: (phone: string) =>
    request<{ data: { message: string; phone: string; bypass?: boolean } }>('/v1/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      timeoutMs: 30_000,
    }),

  /**
   * Verify a 6-digit OTP against the API (legacy Supabase flow — used when
   * the MSG91 widget isn't configured in this build, and by the web billing
   * page).
   */
  verifyOtp: (phone: string, otp: string) =>
    request<{ data: VerifyOtpResult }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
      timeoutMs: 30_000,
    }),

  /**
   * Verify a MSG91 widget access token (real OTP flow, 2026-08-12). The
   * widget verified the code client-side; the API re-confirms the token with
   * MSG91 server-side before issuing a session. Same response shape as
   * verifyOtp.
   */
  verifyMsg91: (phone: string, msg91Token: string) =>
    request<{ data: VerifyOtpResult }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, msg91_token: msg91Token }),
      timeoutMs: 30_000,
    }),
}
