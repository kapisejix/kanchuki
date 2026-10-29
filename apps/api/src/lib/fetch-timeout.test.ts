import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetch-timeout.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchWithTimeout (RC-110)', () => {
  it('aborts a request that never answers', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(init.signal?.reason));
        }),
    );
    await expect(fetchWithTimeout('https://x.test', {}, 20)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('keeps a caller-supplied signal', async () => {
    const own = new AbortController().signal;
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', spy);
    await fetchWithTimeout('https://x.test', { signal: own });
    expect(spy.mock.calls[0]?.[1].signal).toBe(own);
  });

  it('passes method/body through and adds a signal by default', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', spy);
    await fetchWithTimeout('https://x.test', { method: 'POST', body: 'b' });
    const init = spy.mock.calls[0]?.[1];
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
