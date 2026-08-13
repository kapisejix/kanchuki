// MSG91 OTP engine — real OTP configuration for Kanchuki (2026-08-12).
//
// Two verification channels, both confirmed server-side:
//
//   1. MSG91 OTP widget (mobile app) — the @msg91comm/sendotp-react-native SDK
//      sends + verifies the OTP client-side and returns an access token (a
//      JWT). Our backend confirms it with MSG91's widget Verify Access Token
//      API (POST /api/v5/widget/verifyAccessToken) before issuing a session —
//      trusting the client's "verified" claim alone would be an auth bypass.
//
//   2. Classic v5 OTP API (web billing login + payment-account step-up) — the
//      API generates the OTP itself, stores it in Redis (10 min TTL, 5
//      attempts, one-time use), and sends it via POST /api/v5/otp (the same
//      endpoint the Supabase send-sms-hook Edge Function uses). Verification
//      reads the Redis entry.
//
// Failure semantics — FAIL CLOSED on both halves:
//   - SEND: if the Redis guard/store fails (Redis down), the send is refused —
//     an SMS that can never be verified would strand the user with a phantom
//     "OTP sent". MSG91 rejections are mapped to safe messages, never leaked.
//   - VERIFY: 'absent' (never sent / expired / Redis down) lets callers fall
//     back to the legacy Supabase-issued OTP path — BUT callers only do that
//     when MSG91 is NOT configured (see auth.ts); in production 'absent' is a
//     plain 401, never a second verification oracle.
//
// Env: MSG91_AUTHKEY + MSG91_TEMPLATE_ID on the API service (same values the
// Supabase send-sms-hook uses — copy them into the API Railway env).
import { randomInt, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';
import { AppError } from '../plugins/error-handler.js';

const MSG91_BASE = 'https://control.msg91.com/api/v5';

// 10-minute OTP lifetime, max 5 attempts — consumed atomically via GETDEL.
const OTP_TTL_SEC = 600;
const OTP_MAX_ATTEMPTS = 5;
// Per-phone resend cooldown (SMS-cost guard; the global per-IP rate limiter
// keys on IP only). Acquired atomically with SET NX so concurrent sends can't
// double-fire. MSG91 also has dashboard-level caps.
const SEND_COOLDOWN_SEC = 60;

export type OtpPurpose = 'login' | 'stepup';

const CODE_KEY = (purpose: OtpPurpose, phone: string) => `otp:code:${purpose}:${phone}`;
const COOLDOWN_KEY = (phone: string) => `otp:cooldown:${phone}`;

export function isMsg91OtpConfigured(): boolean {
  return Boolean(process.env.MSG91_AUTHKEY && process.env.MSG91_TEMPLATE_ID);
}

// ─── Redis (short-fail, test-bypassable) ────────────────────────────
// Own client instead of getRedis(): BullMQ's maxRetriesPerRequest: null makes
// ioredis retry commands forever on a down connection, which would hang the
// OTP hot path. Same pattern as lib/public-cache.ts.

export interface OtpRedis {
  get(key: string): Promise<string | null>;
  /** Atomic read-and-delete (Redis ≥6.2) — makes one-time OTP consumption race-free. */
  getdel(key: string): Promise<string | null>;
  /** With condition 'NX', resolves 'OK' only when the key did NOT exist. */
  set(key: string, value: string, mode: 'EX', ttl: number, condition?: 'NX'): Promise<'OK' | null>;
  del(key: string): Promise<number>;
}

let otpRedis: Redis | null = null;

function getOtpRedis(): Redis {
  otpRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    lazyConnect: true,
  });
  return otpRedis;
}

// Vitest does NOT override an inherited NODE_ENV (repo .env sets
// development), so the canonical `process.env.VITEST === 'true'` flag is the
// reliable bypass — route tests then take the legacy Supabase path and stay
// deterministic without a Redis instance. Same convention as public-cache.ts.
function redisAvailable(): boolean {
  return process.env.VITEST !== 'true';
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ─── Send ───────────────────────────────────────────────────────────

/**
 * Generate + store + send a 6-digit OTP via MSG91's classic v5 OTP API.
 * Returns the masked phone. Throws AppError on rate limit (429) or send
 * failure (400/500) — the caller never reports a send that didn't happen.
 *
 * `purpose` namespaces the Redis slot so a login OTP and a payment step-up
 * OTP for the same phone never overwrite each other.
 */
export async function sendOtpViaMsg91(
  phone: string,
  purpose: OtpPurpose = 'login',
): Promise<string> {
  const authkey = process.env.MSG91_AUTHKEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  if (!authkey || !templateId) {
    throw new AppError('OTP_SEND_FAILED', 'MSG91 is not configured on the server', 500);
  }

  const redis = redisAvailable() ? getOtpRedis() : null;
  const otp = randomInt(100_000, 1_000_000).toString();

  if (redis) {
    try {
      // Atomic per-phone cooldown — SET NX so two parallel sends can't both
      // pass the check and double-fire an SMS.
      const guard = await redis.set(COOLDOWN_KEY(phone), '1', 'EX', SEND_COOLDOWN_SEC, 'NX');
      if (guard !== 'OK') {
        throw new AppError('RATE_LIMITED', 'Too many OTP requests. Try again in a minute.', 429);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Redis down — the code can't be stored, so it can never be verified.
      // Refuse the send instead of stranding the user with an unverifiable SMS.
      throw new AppError(
        'OTP_SEND_FAILED',
        'Could not start a secure OTP session. Try again.',
        500,
      );
    }

    try {
      await redis.set(
        CODE_KEY(purpose, phone),
        JSON.stringify({ otp, attempts: 0 }),
        'EX',
        OTP_TTL_SEC,
      );
    } catch {
      // Store failed — release the cooldown guard so a retry isn't blocked by
      // a send that never happened.
      await redis.del(COOLDOWN_KEY(phone)).catch(() => undefined);
      throw new AppError(
        'OTP_SEND_FAILED',
        'Could not start a secure OTP session. Try again.',
        500,
      );
    }
  }

  // v5 SendOTP contract (docs.msg91.com/otp/sendotp): POST with the params in
  // the QUERY STRING — authkey is NOT a header and the params are NOT a JSON
  // body. MSG91 answers failures with HTTP 200 + {"type":"error",...} in the
  // body, so the status alone can never be trusted.
  const params = new URLSearchParams({
    authkey,
    template_id: templateId,
    mobile: `91${phone}`,
    otp,
  });
  try {
    const res = await fetch(`${MSG91_BASE}/otp?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    let ok = res.ok;
    if (ok) {
      try {
        const body = (await res.json()) as { type?: string };
        ok = body?.type === 'success';
      } catch {
        ok = false; // unparseable body = not a success
      }
    }
    if (!ok) {
      // Don't leak MSG91 internals — map to a safe message.
      throw new AppError(
        'OTP_SEND_FAILED',
        'Failed to send OTP. Check phone number and try again.',
        400,
      );
    }
  } catch (err) {
    if (redis) await redis.del(COOLDOWN_KEY(phone)).catch(() => undefined);
    if (err instanceof AppError) throw err;
    throw new AppError(
      'OTP_SEND_FAILED',
      'Failed to send OTP. Check your connection and try again.',
      400,
    );
  }

  return `****${phone.slice(-4)}`;
}

// ─── Verify (server-issued OTP) ─────────────────────────────────────

export type StoredOtpResult = 'verified' | 'invalid' | 'locked' | 'absent';

/**
 * Check an OTP against the Redis entry written by sendOtpViaMsg91.
 *   'verified' → consumed atomically via GETDEL (one-time use, replay-safe)
 *   'invalid'  → wrong code, attempts remaining
 *   'locked'   → 5 wrong attempts, entry deleted
 *   'absent'   → no entry (never sent / expired / Redis down) — the caller
 *                decides whether to fall back to the legacy Supabase path
 */
export async function verifyStoredOtp(
  phone: string,
  otp: string,
  purpose: OtpPurpose = 'login',
): Promise<StoredOtpResult> {
  if (!redisAvailable()) return 'absent';
  const redis = getOtpRedis();
  try {
    // GETDEL is atomic — a concurrent second verify reads nothing and reports
    // 'absent', so a used code can never verify twice (matters for the
    // payment step-up path, not just login).
    const raw = await redis.getdel(CODE_KEY(purpose, phone));
    if (!raw) return 'absent';

    const entry = JSON.parse(raw) as { otp: string; attempts: number };
    if (entry.attempts >= OTP_MAX_ATTEMPTS) return 'locked'; // entry already gone
    if (safeEqual(entry.otp, otp)) return 'verified'; // entry already gone

    const attempts = entry.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) return 'locked'; // exhausted — leave deleted
    // Re-create the entry with the remaining attempt budget.
    await redis.set(
      CODE_KEY(purpose, phone),
      JSON.stringify({ otp: entry.otp, attempts }),
      'EX',
      OTP_TTL_SEC,
    );
    return 'invalid';
  } catch {
    return 'absent';
  }
}

// ─── Verify (widget access token) ───────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

/**
 * Confirm a MSG91 widget access token server-side. The SDK's verifyOTP
 * returns a JWT access token; a tampered client could otherwise claim any
 * verified phone. MSG91's server-side check is the widget's Verify Access
 * Token API.
 *
 * CONFIRMED CONTRACT (2026-08-12, MSG91 dashboard curl): POST the authkey AND
 * the widget JWT in the JSON BODY, under the field name `access-token` —
 * NOT as an authkey header / `token` field (the earlier assumption from
 * docs search was wrong and would 401 every widget login).
 *
 * The RESPONSE shape is not formally documented — accept the success signals
 * and identifier locations seen across MSG91 docs/versions, and always
 * require a verified identifier for the claimed phone. Fail closed: any
 * rejection maps to 401, never open.
 *
 * Throws INVALID_OTP (401) when the token is rejected OR when it was minted
 * for a different number than the one the client claims.
 */
export async function verifyMsg91WidgetToken(token: string, expectedPhone: string): Promise<void> {
  const authkey = process.env.MSG91_AUTHKEY;
  if (!authkey) {
    throw new AppError('OTP_VERIFY_FAILED', 'MSG91 is not configured on the server', 500);
  }

  let json: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${MSG91_BASE}/widget/verifyAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authkey, 'access-token': token }),
    });
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new AppError('INVALID_OTP', 'Could not verify the OTP. Try again.', 401);
  }

  const typeOk = json?.type === 'success' || json?.success === true || json?.status === 'success';
  if (!typeOk) {
    throw new AppError('INVALID_OTP', 'Invalid or expired OTP. Try again.', 401);
  }

  const data = isRecord(json?.data) ? json.data : null;
  const widget = isRecord(json?.widget) ? json.widget : null;
  const mobile = firstNonEmpty(
    data?.mobile,
    data?.identifier,
    json?.mobile,
    json?.identifier,
    widget?.mobile,
    widget?.identifier,
  );

  if (!mobile) {
    throw new AppError('INVALID_OTP', 'Could not verify the phone number. Try again.', 401);
  }

  // MSG91 returns the identifier with the country code (e.g. 919876543210).
  // Strip it and require an exact match with the claimed phone — a token for
  // a different number must never authorize this phone's login.
  const verifiedDigits = mobile.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '');
  if (verifiedDigits !== expectedPhone) {
    throw new AppError('INVALID_OTP', 'Phone number does not match the verified number.', 401);
  }
}
