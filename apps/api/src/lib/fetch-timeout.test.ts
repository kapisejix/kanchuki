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

  // Text of each bare `fetch(...)` call by balanced-paren scan. An unbalanced call
  // runs to the end of the file: lenient on purpose, a parse miss must not turn the
  // guard red for a good file.
  function fetchCalls(src: string): Array<{ line: number; text: string }> {
    const out: Array<{ line: number; text: string }> = [];
    for (const m of src.matchAll(/(^|[^A-Za-z0-9_.])fetch\(/gm)) {
      const open = (m.index ?? 0) + m[0].length - 1;
      let depth = 0;
      let end = src.length;
      for (let i = open; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) {
          end = i + 1;
          break;
        }
      }
      out.push({ line: src.slice(0, open).split('\n').length, text: src.slice(open, end) });
    }
    return out;
  }

  const HAS_TIMEOUT = /AbortSignal\.(timeout|any)\(/;

  it('splits calls and tells a timeout from a bare optional signal', () => {
    const calls = fetchCalls(
      "const a = await fetch(`${u.replace(/x/, '')}`, { signal: AbortSignal.timeout(5) });\n" +
        'const b = await fetch(u, { signal });\n' +
        'const c = await fetchWithTimeout(u);',
    );
    expect(calls.map((c) => c.line)).toEqual([1, 2]);
    expect(calls.map((c) => HAS_TIMEOUT.test(c.text))).toEqual([true, false]);
  });

  it('every bare fetch call carries its own timeout', () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(100); // a broken walk must not pass vacuously
    let seen = 0;
    const offenders = files
      .filter((f) => !f.endsWith('fetch-timeout.ts'))
      .flatMap((f) => {
        const src = stripComments(readFileSync(f, 'utf8'));
        if (/fetchWithTimeout\s+as\s+fetch\b/.test(src)) return []; // every fetch( is wrapped
        const rel = f
          .slice(SRC.length + 1)
          .split('\\')
          .join('/');
        return fetchCalls(src)
          .filter((c) => {
            seen++;
            return !HAS_TIMEOUT.test(c.text);
          })
          .map((c) => `${rel}:${c.line}`);
      });
    expect(seen).toBeGreaterThan(20); // the scan must reach the AbortSignal.timeout files
    expect(offenders).toEqual([]);
  });
});
