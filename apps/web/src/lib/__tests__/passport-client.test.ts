// The passport session helper is the single source of truth for "is this
// visitor signed in?" across the customer web app — the `(shopper)` guard, the
// /login form and the /stores entry point all read it. Two properties matter
// and neither had a test before:
//
//   1. The call is BOUNDED. It is an outbound request (through the web's
//      /api/passport proxy) and everything that awaits it is UI state: with no
//      deadline a hung /me leaves callers pending forever — the guard never
//      redirects and the entry point never reaches a decided state (RC-011's
//      class: an unbounded outbound call, invisible because nothing errors).
//   2. A failure is a definite answer, not a throw. Callers do not all wrap
//      this in try/catch, so a rejection escaping here would surface as an
//      unhandled rejection (RC-014's class).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPassportCache, getPassport, getPassportSession } from '../passport-client';

const ME_URL = '/api/passport/me';

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ACCOUNT = {
  id: 'customer-1',
  name: 'Ananya',
  phone_masked: '••••••9999',
  usual_size: null,
  city: null,
};

beforeEach(() => {
  // Module-scope state — every test needs a virgin cache.
  clearPassportCache();
  fetchMock = vi.fn(async () => jsonResponse(401, { error: { message: 'No session' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getPassport', () => {
  it('gives the request a deadline so a hung session check cannot hang the UI', async () => {
    // Asserted at the factory: the returned signal does not expose its own
    // deadline, so the exact bound can only be observed where it is created
    // (the same technique the RC-011 billing test uses).
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    await getPassport();

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    expect(timeoutSpy.mock.calls[0]?.[0]).toBe(10_000);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeDefined();
  });

  it('resolves to null when the request times out instead of leaving callers pending', async () => {
    // What an aborted fetch looks like: a rejected promise. The caller must get
    // a definite "not signed in" — an unhandled rejection here would surface in
    // Sentry and, worse, leave a component stuck in its unknown state.
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));

    await expect(getPassport()).resolves.toBeNull();
    await expect(getPassportSession()).resolves.toBeNull();
  });

  it('sends cookies and never names a customer in the request', async () => {
    await getPassport();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ME_URL);
    expect(init.credentials).toBe('include');
    // The server decides who this is from the cookie.
    expect(url).not.toContain('customer-1');
    expect(String(init.body ?? '')).not.toContain('customer-1');
  });

  it('returns the account when the session is valid', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { account: ACCOUNT }));
    await expect(getPassportSession()).resolves.toEqual(ACCOUNT);
  });

  it('does not memoise a negative result as a positive one', async () => {
    // The 30s cache only ever holds a real session; a failed check must be
    // re-asked rather than pinned, or a shopper who logged in on another tab
    // would keep reading as signed out here.
    await expect(getPassportSession()).resolves.toBeNull();

    fetchMock.mockResolvedValue(jsonResponse(200, { account: ACCOUNT }));
    await expect(getPassportSession()).resolves.toEqual(ACCOUNT);
  });

  it('reuses a cached positive session within the TTL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { account: ACCOUNT }));
    await getPassportSession();
    await getPassportSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clearPassportCache forces the next check to hit the API again', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { account: ACCOUNT }));
    await getPassportSession();
    clearPassportCache();
    await getPassportSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
