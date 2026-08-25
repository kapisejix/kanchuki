// MSG91 OTP widget wrapper — the retailer app's real OTP channel (2026-08-12).
//
// The @msg91comm/sendotp-react-native SDK is a NATIVE module (android/ + ios/
// folders, no Expo config plugin): it does NOT run in Expo Go. Builds must go
// through EAS or `expo run:*` so the native code is compiled in.
//
// When EXPO_PUBLIC_MSG91_WIDGET_ID / EXPO_PUBLIC_MSG91_TOKEN_AUTH are unset
// (e.g. an Expo Go dev build), isMsg91OtpConfigured() returns false and the
// auth screens fall back to the legacy API OTP flow, so the app stays usable.
//
// The SDK's responses are untyped (`any`) — every extraction here is
// defensive: reqId / access token can sit at different depths across MSG91
// widget API versions, and the access token (a JWT) is what the API re-verifies
// server-side via the Verify Access Token endpoint.
//
// The SDK is loaded LAZILY (require, not import) because its index.ts touches
// NativeModules.BiometricAuth at MODULE SCOPE and logs "BiometricAuth is
// undefined!" on every module evaluation — which fires on EVERY app boot in
// Expo Go, where the native module isn't linked, even though the widget is
// never used there (isMsg91OtpConfigured() is false). The module scope only
// runs once require() is actually called, i.e. only in EAS/dev builds that
// really use the widget.
type Msg91Sdk = typeof import('@msg91comm/sendotp-react-native')
let sdk: Msg91Sdk | null = null
function getSdk(): Msg91Sdk {
  if (!sdk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('@msg91comm/sendotp-react-native') as Msg91Sdk
  }
  return sdk
}

// EXPO_PUBLIC_* vars are statically inlined at build time (dot access keeps
// expo lint's no-dynamic-env-var rule happy — the API_URL client uses the
// same pattern).
const WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || '366871673575383335383835'
const TOKEN_AUTH = process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH || '505769TIAaX1pQa6a649a52P1'

let initialized = false

/** True when the build was compiled with real MSG91 widget credentials. */
export function isMsg91OtpConfigured(): boolean {
  return Boolean(WIDGET_ID && TOKEN_AUTH)
}

function initWidget(): void {
  if (initialized || !WIDGET_ID || !TOKEN_AUTH) return
  getSdk().OTPWidget.initializeWidget(WIDGET_ID, TOKEN_AUTH)
  initialized = true
}

// MSG91 has returned reqId as a NUMBER in some widget API versions — coerce
// any non-empty scalar to string so a numeric reqId can't silently break the
// flow (a missing reqId would otherwise degrade into the legacy OTP path with
// no SMS behind it).
function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (v === undefined || v === null) continue
    const s = String(v)
    if (s.length > 0) return s
  }
  return undefined
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

/** Extract the widget request id from a sendOTP/verifyOTP response. */
export function extractMsg91ReqId(response: unknown): string | undefined {
  const r = asRecord(response)
  if (!r) return undefined
  const data = asRecord(r.data) ?? asRecord(r.result)
  return firstString(r.reqId, data?.reqId, r.req_id, data?.req_id)
}

/**
 * Extract the MSG91 access token (a JWT — two dots) from a verifyOTP
 * response. The token is what our backend re-verifies with MSG91.
 */
export function extractMsg91AccessToken(response: unknown): string | undefined {
  const r = asRecord(response)
  if (!r) return undefined
  const data = asRecord(r.data) ?? asRecord(r.result)
  const candidates = [
    r.message,
    r.token,
    r.accessToken,
    r.access_token,
    data?.token,
    data?.accessToken,
    data?.access_token,
    data?.message,
  ]
  // A JWT is header.payload.signature — require all three segments so a
  // plain status message like "OTP verified" is never mistaken for a token.
  return candidates.find(
    (c): c is string => typeof c === 'string' && c.split('.').length >= 3,
  )
}

/**
 * Send the OTP via the widget. `phoneDigits` must be the 10-digit number
 * WITHOUT a country code — the widget requires the identifier WITH country
 * code and no '+'.
 */
export function sendMsg91Otp(phoneDigits: string): Promise<unknown> {
  initWidget()
  return getSdk().OTPWidget.sendOTP({ identifier: `91${phoneDigits}` })
}

/** Resend the OTP on the same channel (11 = SMS). */
export function retryMsg91Otp(reqId: string): Promise<unknown> {
  initWidget()
  return getSdk().OTPWidget.retryOTP({ reqId, retryChannel: 11 })
}

/**
 * Ask the widget to verify. `otp` may be omitted when the widget is in
 * invisible mode (carrier-side verification) — pass just the reqId.
 */
export function verifyMsg91Otp(reqId: string, otp?: string): Promise<unknown> {
  initWidget()
  const body = otp ? { reqId, otp } : { reqId }
  return getSdk().OTPWidget.verifyOTP(body)
}
