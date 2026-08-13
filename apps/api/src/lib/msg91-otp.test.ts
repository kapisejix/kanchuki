/**
 * MSG91 OTP engine unit tests (2026-08-12).
 *
 * Covers the two server-side verification channels:
 *   - classic v5 OTP send + Redis-stored verification (web/step-up),
 *   - widget Verify Access Token server-side check (mobile).
 *
 * Redis is faked with an in-memory ioredis stand-in and `process.env.VITEST`
 * is removed for this file only so the lib's test-bypass (repo convention:
 * route tests skip Redis) doesn't apply here — the file's Redis logic is
 * exactly what's under test. Vitest runs each file in its own worker process,
 * so the env mutation can't leak into other suites.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '../plugins/error-handler.js';

// In-memory ioredis stand-in, injected via vi.mock so the lib's lazy client
// (getOtpRedis) picks it up. The store is exposed for reset + assertions.
const { FakeRedis, store: fakeStore } = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  class FakeRedis {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }
    // Atomic like real Redis GETDEL — the read+delete happen in one
    // synchronous block so concurrent callers can't both read the value.
    async getdel(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      store.delete(key);
      return entry.value;
    }
    async set(
      key: string,
      value: string,
      _mode: 'EX',
      ttlSec: number,
      condition?: 'NX',
    ): Promise<'OK' | null> {
      if (condition === 'NX' && (await this.get(key)) !== null) return null;
      store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
      return 'OK';
    }
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    }
  }
  return { FakeRedis, store };
});

vi.mock('ioredis', () => ({ Redis: FakeRedis }));

// Import AFTER the ioredis mock (vi.mock hoists anyway).
const { isMsg91OtpConfigured, sendOtpViaMsg91, verifyMsg91WidgetToken, verifyStoredOtp } =
  await import('./msg91-otp.js');

const fetchMock = vi.fn();

beforeEach(() => {
  fakeStore.clear();
  process.env.MSG91_AUTHKEY = 'test-authkey';
  process.env.MSG91_TEMPLATE_ID = 'test-template';
  process.env.REDIS_URL = 'redis://test:6379';
  delete process.env.VITEST; // enable the Redis path for these tests
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  // MSG91 answers success as HTTP 200 + {"type":"success"} in the body —
  // the lib now requires both.
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ type: 'success' }) } as Response);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MSG91_AUTHKEY;
  delete process.env.MSG91_TEMPLATE_ID;
  delete process.env.REDIS_URL;
  delete process.env.VITEST;
});

describe('isMsg91OtpConfigured', () => {
  it('is true when both keys are set', () => {
    expect(isMsg91OtpConfigured()).toBe(true);
  });

  it('is false when the authkey is missing', () => {
    delete process.env.MSG91_AUTHKEY;
    expect(isMsg91OtpConfigured()).toBe(false);
  });
});

describe('sendOtpViaMsg91', () => {
  it('stores the code in Redis and sends via the v5 OTP API', async () => {
    const masked = await sendOtpViaMsg91('9876543210');

    expect(masked).toBe('****3210');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    // v5 SendOTP contract: params go in the query string, authkey is NOT a
    // header and the params are NOT a JSON body.
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://control.msg91.com/api/v5/otp');
    expect(parsed.searchParams.get('authkey')).toBe('test-authkey');
    expect(parsed.searchParams.get('template_id')).toBe('test-template');
    expect(parsed.searchParams.get('mobile')).toBe('919876543210'); // country code, no '+'
    expect(parsed.searchParams.get('otp')).toMatch(/^\d{6}$/);
    // authkey must NOT ride as a header (old bug) — only Content-Type stays.
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });

    // The stored entry verifies with the sent code.
    expect(await verifyStoredOtp('9876543210', parsed.searchParams.get('otp')!)).toBe('verified');
  });

  it('namespaces the Redis slot by purpose (login vs stepup)', async () => {
    await sendOtpViaMsg91('9876543210'); // default: login slot
    // The send cooldown is intentionally shared per phone (SMS-cost guard) —
    // clear it so this second send can go out for the purpose test.
    fakeStore.delete('otp:cooldown:9876543210');
    await sendOtpViaMsg91('9876543210', 'stepup');

    // Same phone, two OTPs, two independent slots — neither clobbers the other.
    const loginCode = (
      JSON.parse(fakeStore.get('otp:code:login:9876543210')!.value) as { otp: string }
    ).otp;
    const stepupCode = (
      JSON.parse(fakeStore.get('otp:code:stepup:9876543210')!.value) as { otp: string }
    ).otp;
    expect(loginCode).not.toBe(stepupCode);
    expect(await verifyStoredOtp('9876543210', loginCode)).toBe('verified');
    expect(await verifyStoredOtp('9876543210', stepupCode, 'stepup')).toBe('verified');
    // The other slot is untouched by the verify.
    expect(await verifyStoredOtp('9876543210', stepupCode)).toBe('absent');
  });

  it('fails the send closed when Redis cannot guard the request (no phantom SMS)', async () => {
    // The cooldown guard (first SET NX) fails → a secure OTP session cannot
    // start → the SMS must never go out.
    const setSpy = vi.spyOn(FakeRedis.prototype, 'set');
    setSpy.mockRejectedValueOnce(new Error('connection lost'));

    await expect(sendOtpViaMsg91('9876543210')).rejects.toMatchObject({
      code: 'OTP_SEND_FAILED',
      status: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it('rejects a second send within the per-phone cooldown', async () => {
    await sendOtpViaMsg91('9876543210');
    await expect(sendOtpViaMsg91('9876543210')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the first send reached MSG91
  });

  it('fails the send when MSG91 answers HTTP 200 with an error body (never trust the status alone)', async () => {
    // The exact production failure: MSG91 returns 200 + {"type":"error"} when
    // the request is malformed or the authkey is not recognized — the old code
    // reported "OTP sent" and no SMS ever went out.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'error', message: 'wrong auth key or template' }),
    } as Response);
    await expect(sendOtpViaMsg91('9876543210')).rejects.toMatchObject({
      code: 'OTP_SEND_FAILED',
      status: 400,
    });
  });

  it('does not leak MSG91 errors — maps to a safe 400', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ type: 'error', message: 'invalid mobile number' }),
    } as Response);
    let err: unknown;
    try {
      await sendOtpViaMsg91('9876543210');
    } catch (e) {
      err = e;
    }
    const appErr = err as AppError;
    expect(appErr.code).toBe('OTP_SEND_FAILED');
    expect(appErr.status).toBe(400);
    // The MSG91 message must never surface to the client.
    expect(appErr.message).not.toContain('invalid mobile number');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a config error when MSG91 keys are unset', async () => {
    delete process.env.MSG91_AUTHKEY;
    await expect(sendOtpViaMsg91('9876543210')).rejects.toMatchObject({
      code: 'OTP_SEND_FAILED',
      status: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('verifyStoredOtp', () => {
  it('returns absent when no entry exists', async () => {
    expect(await verifyStoredOtp('9876543210', '123456')).toBe('absent');
  });

  it('is one-time use — a verified entry is consumed atomically', async () => {
    await sendOtpViaMsg91('9876543210');
    const sentOtp = (
      JSON.parse(fakeStore.get('otp:code:login:9876543210')!.value) as { otp: string }
    ).otp;
    expect(await verifyStoredOtp('9876543210', sentOtp)).toBe('verified');
    expect(await verifyStoredOtp('9876543210', sentOtp)).toBe('absent');
  });

  it('is replay-safe under a concurrent double-verify (GETDEL)', async () => {
    await sendOtpViaMsg91('9876543210');
    const sentOtp = (
      JSON.parse(fakeStore.get('otp:code:login:9876543210')!.value) as { otp: string }
    ).otp;
    // Both verifies read the SAME entry — only one may succeed.
    const [a, b] = await Promise.all([
      verifyStoredOtp('9876543210', sentOtp),
      verifyStoredOtp('9876543210', sentOtp),
    ]);
    expect([a, b].sort()).toEqual(['absent', 'verified']);
  });

  it('tracks wrong attempts and locks the entry after 5', async () => {
    await sendOtpViaMsg91('9876543210');
    for (let i = 0; i < 4; i += 1) {
      expect(await verifyStoredOtp('9876543210', '000000')).toBe('invalid');
    }
    expect(await verifyStoredOtp('9876543210', '000000')).toBe('locked');
    expect(await verifyStoredOtp('9876543210', '000000')).toBe('absent'); // deleted
  });

  it('bypasses Redis under vitest (repo convention)', async () => {
    process.env.VITEST = 'true';
    await sendOtpViaMsg91('9876543210'); // still writes (skip happens on read paths)
    expect(await verifyStoredOtp('9876543210', '000000')).toBe('absent');
  });
});

describe('verifyMsg91WidgetToken', () => {
  it('sends the CONFIRMED contract — authkey + access-token in the BODY, not headers', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'success', data: { mobile: '919876543210' } }),
    } as Response);
    await expect(verifyMsg91WidgetToken('jwt.token.here', '9876543210')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/widget/verifyAccessToken');
    // MSG91 dashboard curl (2026-08-12): both credentials travel in the body;
    // a header-only authkey would 401 every widget login.
    expect(init.headers).not.toHaveProperty('authkey');
    expect(JSON.parse(String(init.body))).toEqual({
      authkey: 'test-authkey',
      'access-token': 'jwt.token.here',
    });
  });

  it.each([
    ['type+data.mobile', { type: 'success', data: { mobile: '919876543210' } }],
    ['success+mobile top-level', { success: true, mobile: '919876543210' }],
    ['status+data.identifier', { status: 'success', data: { identifier: '919876543210' } }],
    ['type+widget.identifier', { type: 'success', widget: { identifier: '919876543210' } }],
  ])('accepts the %s response shape', async (_name, response) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => response } as Response);
    await expect(verifyMsg91WidgetToken('jwt.token.here', '9876543210')).resolves.toBeUndefined();
  });

  it('rejects a token minted for a DIFFERENT phone', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'success', data: { mobile: '919555555555' } }),
    } as Response);
    await expect(verifyMsg91WidgetToken('jwt.token.here', '9876543210')).rejects.toMatchObject({
      code: 'INVALID_OTP',
      status: 401,
    });
  });

  it('rejects a non-success MSG91 response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'error', message: 'invalid token' }),
    } as Response);
    await expect(verifyMsg91WidgetToken('bad.token', '9876543210')).rejects.toMatchObject({
      code: 'INVALID_OTP',
      status: 401,
    });
  });

  it('rejects a success response WITHOUT an identifier (never trusts a bare success)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'success', message: 'token verified' }),
    } as Response);
    await expect(verifyMsg91WidgetToken('jwt.token.here', '9876543210')).rejects.toMatchObject({
      code: 'INVALID_OTP',
      status: 401,
    });
  });

  it('rejects when the MSG91 API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(verifyMsg91WidgetToken('jwt.token.here', '9876543210')).rejects.toMatchObject({
      code: 'INVALID_OTP',
      status: 401,
    });
  });
});
