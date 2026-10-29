import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@kanchuki/shared/testing';
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

// RC-118: RC-110 fixed the call sites someone remembered; 16 more (Meta Graph social
// routes, FB Ads, Google OAuth, the collection WhatsApp fan-out, Razorpay plan create,
// two jobs) still called bare `fetch` and could hang forever. A file that calls `fetch(`
// must route it through fetchWithTimeout (usually `import { fetchWithTimeout as fetch }`)
// or pass its own AbortSignal.
describe('outbound fetch has a timeout (RC-118)', () => {
  const SRC = join(__dirname, '..');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [full] : [];
    });
  }

  it('no file calls bare fetch without fetchWithTimeout or an AbortSignal', () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(100); // a broken walk must not pass vacuously
    const offenders = files
      .filter((f) => !f.endsWith('fetch-timeout.ts'))
      .filter((f) => {
        const src = stripComments(readFileSync(f, 'utf8'));
        return /(^|[^A-Za-z0-9_.])fetch\(/m.test(src) && !/fetchWithTimeout|AbortSignal/.test(src);
      })
      .map((f) => f.slice(SRC.length + 1).split('\\').join('/'));
    expect(offenders).toEqual([]);
  });
});
