// MSG91 OTP widget — web integration (2026-08-12). Browser counterpart of the
// mobile SDK: loads the widget script, exposes programmatic send/verify/retry
// (exposeMethods: true), and hands the verified access token to our API for
// server-side re-verification (POST /v1/auth/otp/verify { phone, msg91_token }).
// The API confirms the token with MSG91's Verify Access Token endpoint — the
// token is never trusted client-side.
//
// The widget script is a third-party dependency (verify.msg91.com with a
// verify.phone91.com fallback) and only loads when
// NEXT_PUBLIC_MSG91_WIDGET_ID / NEXT_PUBLIC_MSG91_TOKEN_AUTH are set at build
// time. Callers fall back to the API OTP flow when the widget is unconfigured,
// blocked, or fails to load — login must never depend on a third-party CDN.
//
// Env: set NEXT_PUBLIC_MSG91_WIDGET_ID + NEXT_PUBLIC_MSG91_TOKEN_AUTH as
// build args (Railway dashboard + apps/web/Dockerfile ARG declarations).

const WIDGET_ID = process.env['NEXT_PUBLIC_MSG91_WIDGET_ID'];
const TOKEN_AUTH = process.env['NEXT_PUBLIC_MSG91_TOKEN_AUTH'];

// ─── Global API surface exposed by the widget (exposeMethods: true) ──
declare global {
  interface Window {
    initSendOTP?: (configuration: Record<string, unknown>) => void;
    sendOtp?: (
      identifier: string,
      success?: (data: unknown) => void,
      failure?: (error: unknown) => void,
    ) => void;
    retryOtp?: (
      channel: string,
      success?: (data: unknown) => void,
      failure?: (error: unknown) => void,
      reqId?: string,
    ) => void;
    verifyOtp?: (
      otp: string,
      success?: (data: unknown) => void,
      failure?: (error: unknown) => void,
      reqId?: string,
    ) => void;
    getWidgetData?: () => unknown;
    isCaptchaVerified?: () => boolean;
  }
}

export function isMsg91WidgetConfigured(): boolean {
  return Boolean(WIDGET_ID && TOKEN_AUTH);
}

let loadStarted = false;
let loadResult: Promise<boolean> | null = null;

/**
 * Load the widget script once (with the phone91 fallback) and initialize it.
 * Resolves true when window.sendOtp is available afterwards. Safe to call
 * from any screen; idempotent.
 */
export function loadMsg91Widget(): Promise<boolean> {
  if (!isMsg91WidgetConfigured() || typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  if (typeof window.sendOtp === 'function') return Promise.resolve(true);
  if (loadStarted) return loadResult ?? Promise.resolve(false);

  loadStarted = true;
  loadResult = new Promise<boolean>((resolve) => {
    const urls = [
      'https://verify.msg91.com/otp-provider.js',
      'https://verify.phone91.com/otp-provider.js',
    ];
    let i = 0;
    const attempt = (): void => {
      if (i >= urls.length) {
        resolve(false);
        return;
      }
      const script = document.createElement('script');
      script.src = urls[i]!;
      script.async = true;
      script.onload = () => {
        if (typeof window.initSendOTP === 'function') {
          window.initSendOTP({
            widgetId: WIDGET_ID,
            tokenAuth: TOKEN_AUTH,
            exposeMethods: true, // bind window.sendOtp/verifyOtp/retryOtp, no built-in UI
          });
          resolve(typeof window.sendOtp === 'function');
        } else {
          i += 1;
          attempt();
        }
      };
      script.onerror = () => {
        i += 1;
        attempt();
      };
      document.head.appendChild(script);
    };
    attempt();
  });
  return loadResult;
}

// ─── Response extraction (the widget's callbacks are untyped) ──────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** The widget session id — needed to pass verify/retry back to the widget. */
export function extractReqId(data: unknown): string | undefined {
  const r = asRecord(data);
  if (!r) return undefined;
  const nested = asRecord(r.data) ?? asRecord(r.result);
  const value = [r.reqId, r.req_id, nested?.reqId, nested?.req_id].find(
    (v) => v !== undefined && v !== null,
  );
  // MSG91 has returned reqId as a number in some versions — coerce defensively.
  return value === undefined ? undefined : String(value);
}

/** The JWT access token the API re-verifies server-side. */
export function extractAccessToken(data: unknown): string | undefined {
  const r = asRecord(data);
  if (!r) return undefined;
  const nested = asRecord(r.data) ?? asRecord(r.result);
  const candidates = [
    r.message,
    r.token,
    r.accessToken,
    r.access_token,
    nested?.token,
    nested?.accessToken,
    nested?.access_token,
    nested?.message,
  ];
  // A JWT is header.payload.signature — require all three segments so a
  // plain status message like "OTP verified" (or a stray 'a.b') is never
  // mistaken for a token.
  return candidates.find(
    (c): c is string => typeof c === 'string' && c.split('.').length >= 3,
  );
}

/** Surface a readable message from the widget's opaque failure payload. */
export function widgetErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.length > 0) return error;
  const r = asRecord(error);
  const message = r?.message ?? r?.error ?? r?.reason;
  if (typeof message === 'string' && message.length > 0) return message;
  return fallback;
}

// ─── Flow wrappers ────────────────────────────────────────────────
// The widget is callback-based (returns void) — wrap in promises with a
// timeout so a broken/blocked script can't hang the login card.

const SEND_TIMEOUT_MS = 30_000;
const VERIFY_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The OTP service did not respond. Try again.')),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface WidgetSendResult {
  ok: boolean;
  reqId?: string;
  token?: string;
  error?: unknown;
}

/** Send the OTP via the widget. identifier must include the country code, no '+'. */
export function sendOtpViaWidget(identifier: string): Promise<WidgetSendResult> {
  if (typeof window.sendOtp !== 'function') {
    return Promise.resolve({ ok: false, error: new Error('MSG91 widget not loaded') });
  }
  return withTimeout(
    new Promise<WidgetSendResult>((resolve) => {
      window.sendOtp?.(
        identifier,
        (data) => resolve({ ok: true, reqId: extractReqId(data), token: extractAccessToken(data) }),
        (error) => resolve({ ok: false, error }),
      );
    }),
    SEND_TIMEOUT_MS,
  );
}

export interface WidgetVerifyResult {
  ok: boolean;
  token?: string;
  error?: unknown;
}

/**
 * Ask the widget to verify the entered code; on success returns the JWT.
 * `timeoutMs` may be shortened for the invisible-mode auto-verify probe.
 */
export function verifyOtpViaWidget(
  otp: string,
  reqId?: string,
  timeoutMs = VERIFY_TIMEOUT_MS,
): Promise<WidgetVerifyResult> {
  if (typeof window.verifyOtp !== 'function') {
    return Promise.resolve({ ok: false, error: new Error('MSG91 widget not loaded') });
  }
  return withTimeout(
    new Promise<WidgetVerifyResult>((resolve) => {
      window.verifyOtp?.(
        otp,
        (data) => resolve({ ok: true, token: extractAccessToken(data) }),
        (error) => resolve({ ok: false, error }),
        reqId,
      );
    }),
    timeoutMs,
  );
}

/** Resend the OTP on SMS (channel '11'). */
export function retryOtpViaWidget(reqId?: string): Promise<{ ok: boolean; error?: unknown }> {
  if (typeof window.retryOtp !== 'function') {
    return Promise.resolve({ ok: false, error: new Error('MSG91 widget not loaded') });
  }
  return withTimeout(
    new Promise<{ ok: boolean; error?: unknown }>((resolve) => {
      window.retryOtp?.(
        '11',
        () => resolve({ ok: true }),
        (error) => resolve({ ok: false, error }),
        reqId,
      );
    }),
    VERIFY_TIMEOUT_MS,
  );
}
