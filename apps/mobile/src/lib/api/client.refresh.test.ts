import { beforeEach, describe, expect, it, vi } from 'vitest';

// RC-202 — an expired access token triggers POST /v1/auth/refresh. Only a real
// rejection (no refresh token, 400/401/403) may log out: logout clears the
// offline sales queue. A 5xx/429 or network failure (Railway redeploy, flaky
// 3G) must keep the tokens and the queue and just fail this request.
const m = vi.hoisted(() => ({
  cachedJsonRequest: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  deleteItem: vi.fn(),
  emitAuthChange: vi.fn(),
  replace: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('expo-router', () => ({ router: { replace: m.replace } }));
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('expo-file-system', () => ({ File: class {} }));
vi.mock('../auth-events', () => ({ emitAuthChange: m.emitAuthChange }));
vi.mock('../storage', () => ({ getItem: m.getItem, setItem: m.setItem, deleteItem: m.deleteItem }));
vi.mock('../request-cache', () => ({
  cachedJsonRequest: m.cachedJsonRequest,
  clearRequestCache: vi.fn(),
}));
vi.mock('../compress-image', () => ({ compressImageForUpload: vi.fn() }));

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__DEV__ = false;
});

import { request } from './client';

const expired = Object.assign(new Error('expired'), { code: 'UNAUTHORIZED', status: 401 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); // redirectToAuth's 4 s debounce reset
  globalThis.fetch = m.fetch as unknown as typeof fetch;
  m.getItem.mockImplementation(async (k: string) => (k === 'refresh_token' ? 'rt' : 'at'));
  m.cachedJsonRequest.mockRejectedValueOnce(expired);
});

const loggedOut = () =>
  m.deleteItem.mock.calls.some(([k]) => k === 'refresh_token') ||
  m.emitAuthChange.mock.calls.length > 0;

describe('request() refresh on 401 (RC-202)', () => {
  it.each([502, 503, 429, 408])('refresh %i: keeps tokens, no logout, request fails', async (s) => {
    m.fetch.mockResolvedValue({ ok: false, status: s });
    await expect(request('/v1/products')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(loggedOut()).toBe(false);
    expect(m.replace).not.toHaveBeenCalled();
  });

  it('refresh network error: keeps tokens, no logout', async () => {
    m.fetch.mockRejectedValue(new TypeError('Network request failed'));
    await expect(request('/v1/products')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(loggedOut()).toBe(false);
  });

  it('after a transient failure the next 401 tries refresh again', async () => {
    m.fetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(request('/v1/products')).rejects.toBeTruthy();
    m.cachedJsonRequest.mockRejectedValueOnce(expired).mockResolvedValueOnce({ ok: 1 });
    m.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { access_token: 'at2', refresh_token: 'rt2' } }),
    });
    await expect(request('/v1/products')).resolves.toEqual({ ok: 1 });
    expect(m.fetch).toHaveBeenCalledTimes(2);
    expect(m.setItem).toHaveBeenCalledWith('refresh_token', 'rt2');
  });

  it.each([401, 403, 400])('refresh %i: session is dead, logs out as before', async (s) => {
    vi.advanceTimersByTime(5000);
    m.fetch.mockResolvedValue({ ok: false, status: s });
    await expect(request('/v1/products')).rejects.toBeTruthy();
    expect(m.deleteItem).toHaveBeenCalledWith('refresh_token');
    expect(m.emitAuthChange).toHaveBeenCalledWith({ authed: false });
  });

  it('no refresh token stored: logs out', async () => {
    vi.advanceTimersByTime(5000);
    m.getItem.mockImplementation(async (k: string) => (k === 'refresh_token' ? null : 'at'));
    await expect(request('/v1/products')).rejects.toBeTruthy();
    expect(m.deleteItem).toHaveBeenCalledWith('refresh_token');
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
