// MSG91 OTP widget wrapper — the retailer app's real OTP channel (2026-08-12).
//
// The @msg91comm/sendotp-react-native SDK is a NATIVE module (android/ + ios/
// folders, no Expo config plugin): it does NOT run in Expo Go. Builds must go
// through EAS or `expo run:*` so the native code is compiled in.
//
// When the API returns no widget credentials (Railway MSG91_WIDGET_ID /
// MSG91_WIDGET_TOKEN unset) or in Expo Go, isMsg91OtpConfigured() is false and the
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
import { NativeModules } from 'react-native';
import { authApi } from './api/auth';

type Msg91Sdk = typeof import('@msg91comm/sendotp-react-native');
let sdk: Msg91Sdk | null = null;

function hasNativeMsg91Module(): boolean {
  return Boolean(
    NativeModules &&
      (NativeModules.BiometricAuth || NativeModules.OTPWidget || NativeModules.SendOTP),
  );
}

function getSdk(): Msg91Sdk | null {
  if (!sdk) {
    if (!hasNativeMsg91Module()) {
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sdk = require('@msg91comm/sendotp-react-native') as Msg91Sdk;
    } catch (e) {
      console.warn('[msg91] Native module load failed, falling back to API:', e);
      return null;
    }
  }
  return sdk;
}

// Widget id + tokenAuth come from the API (Railway env MSG91_WIDGET_ID /
// MSG91_WIDGET_TOKEN) at runtime — never baked into the build or the repo, so
// rotating them is a Railway change, not a new APK.
let WIDGET_ID: string | null = null;
let TOKEN_AUTH: string | null = null;

let initialized = false;

/** True once the widget credentials are loaded AND the native module is linked. */
export function isMsg91OtpConfigured(): boolean {
  return Boolean(hasNativeMsg91Module() && WIDGET_ID && TOKEN_AUTH);
}

/**
 * Fetch the widget credentials once (cached on success). Resolves to
 * isMsg91OtpConfigured(); any failure → false → classic API OTP fallback.
 */
export async function loadMsg91OtpConfig(): Promise<boolean> {
  if (!hasNativeMsg91Module()) return false;
  if (!WIDGET_ID || !TOKEN_AUTH) {
    try {
      const res = await authApi.widgetConfig();
      WIDGET_ID = res.data?.widget_id ?? null;
      TOKEN_AUTH = res.data?.token_auth ?? null;
    } catch (e) {
      console.warn('[msg91] widget config fetch failed, falling back to API:', e);
    }
  }
  return isMsg91OtpConfigured();
}

function initWidget(): void {
  if (initialized || !WIDGET_ID || !TOKEN_AUTH) return;
  const s = getSdk();
  if (!s?.OTPWidget) return;
  s.OTPWidget.initializeWidget(WIDGET_ID, TOKEN_AUTH);
  initialized = true;
}

// MSG91 has returned reqId as a NUMBER in some widget API versions — coerce
// any non-empty scalar to string so a numeric reqId can't silently break the
// flow (a missing reqId would otherwise degrade into the legacy OTP path with
// no SMS behind it).
function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const s = String(v);
    if (s.length > 0) return s;
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** Extract the widget request id from a sendOTP/verifyOTP response. */
export function extractMsg91ReqId(response: unknown): string | undefined {
  const r = asRecord(response);
  if (!r) return undefined;
  const data = asRecord(r.data) ?? asRecord(r.result);
  // SDK sendOTP success is { type: 'success', message: '<reqId>' }. The format
  // check keeps a plain status message from being mistaken for an id.
  const messageId =
    r.type === 'success' && typeof r.message === 'string' && /^[A-Za-z0-9]{16,}$/.test(r.message)
      ? r.message
      : undefined;
  return firstString(r.reqId, data?.reqId, r.req_id, data?.req_id, messageId);
}

/**
 * Extract the MSG91 access token (a JWT — two dots) from a verifyOTP
 * response. The token is what our backend re-verifies with MSG91.
 */
export function extractMsg91AccessToken(response: unknown): string | undefined {
  const r = asRecord(response);
  if (!r) return undefined;
  const data = asRecord(r.data) ?? asRecord(r.result);
  const candidates = [
    r.message,
    r.token,
    r.accessToken,
    r.access_token,
    data?.token,
    data?.accessToken,
    data?.access_token,
    data?.message,
  ];
  // A JWT is header.payload.signature — require all three segments so a
  // plain status message like "OTP verified" is never mistaken for a token.
  return candidates.find((c): c is string => typeof c === 'string' && c.split('.').length >= 3);
}

/**
 * Send the OTP via the widget. `phoneDigits` must be the 10-digit number
 * WITHOUT a country code — the widget requires the identifier WITH country
 * code and no '+'.
 */
export function sendMsg91Otp(phoneDigits: string): Promise<unknown> {
  const s = getSdk();
  if (!s?.OTPWidget) {
    return Promise.reject(new Error('MSG91 native module not available in this build'));
  }
  initWidget();
  return s.OTPWidget.sendOTP({ identifier: `91${phoneDigits}` });
}

/** Resend the OTP on the same channel (11 = SMS). */
export function retryMsg91Otp(reqId: string): Promise<unknown> {
  const s = getSdk();
  if (!s?.OTPWidget) {
    return Promise.reject(new Error('MSG91 native module not available in this build'));
  }
  initWidget();
  return s.OTPWidget.retryOTP({ reqId, retryChannel: 11 });
}

/**
 * Ask the widget to verify. `otp` may be omitted when the widget is in
 * invisible mode (carrier-side verification) — pass just the reqId.
 */
export function verifyMsg91Otp(reqId: string, otp?: string): Promise<unknown> {
  const s = getSdk();
  if (!s?.OTPWidget) {
    return Promise.reject(new Error('MSG91 native module not available in this build'));
  }
  initWidget();
  const body = otp ? { reqId, otp } : { reqId };
  return s.OTPWidget.verifyOTP(body);
}
