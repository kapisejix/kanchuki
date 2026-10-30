// RC-112 (admin writes bypassing the shared CSRF helper, and the helper caching a rejected
// token fetch) and RC-109 (admin GST report printing paise as rupees).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminMutateOptions, resetAdminFetchCache } from '../admin-fetch';
import { rupees } from '../plan-pricing';

const page = (rel: string) => readFileSync(path.resolve(__dirname, '../../app/admin', rel), 'utf8');

describe('adminMutateOptions: a failed CSRF fetch is not cached (RC-112)', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'key-1' });
    resetAdminFetchCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retries the token fetch after a rejection instead of re-throwing the stale error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { csrf_token: 'tok-2' } }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adminMutateOptions()).rejects.toThrow('HTTP 500');
    const opts = await adminMutateOptions();
    expect((opts.headers as Record<string, string>)['x-csrf-token']).toBe('tok-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still shares one in-flight fetch between concurrent callers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: { csrf_token: 'tok' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([adminMutateOptions(), adminMutateOptions()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('admin pages use the shared CSRF helper for writes (RC-112)', () => {
  it('SQL console POST sends the CSRF token', () => {
    const src = page('database/query/page.tsx');
    const at = src.indexOf('/v1/admin/query`');
    expect(at).toBeGreaterThan(-1);
    const call = src.slice(at, at + 200);
    expect(call).toContain("method: 'POST'");
    expect(call).toContain('adminMutateOptions()');
    expect(call).not.toContain('getAdminHeaders()');
  });

  it('social Force Disconnect DELETE sends the CSRF token and surfaces a failure', () => {
    const src = page('social/page.tsx');
    const at = src.indexOf("method: 'DELETE'");
    expect(at).toBeGreaterThan(-1);
    const call = src.slice(at, at + 80);
    expect(call).toContain('adminMutateOptions()');
    expect(call).not.toContain('adminGetOptions()');
    expect(src).toContain('setDisconnectError(');
    expect(src).not.toMatch(/catch \{\s*\/\/ ignore/);
  });
});

// T2.4 F6 - the hand-copied getAdminHeaders() helpers were the same copy-paste shape that
// produced the RC-112 403s. Admin requests take their headers from lib/admin-fetch.ts;
// layout.tsx is the one exception (the session check passes an explicit stored key).
describe('admin pages do not hand-build the admin auth header (T2.4 F6)', () => {
  const adminDir = path.resolve(__dirname, '../../app/admin');
  const files = readdirSync(adminDir, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__') && f !== 'layout.tsx');

  it('scans the admin tree (guards against a path that matches nothing)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no admin file defines getAdminHeaders or sets x-admin-key itself', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(path.join(adminDir, f), 'utf8');
      return src.includes("'x-admin-key'") || /function getAdminHeaders\b/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe('admin GST report units (RC-109)', () => {
  it('rupees() converts paise', () => {
    expect(rupees(210000)).toBe('₹2,100');
    expect(rupees(3816)).toBe('₹38.16');
  });

  it('the page formats through rupees(), not a raw toLocaleString', () => {
    const src = page('reports/gst/page.tsx');
    expect(src).toContain("import { rupees } from '@/lib/plan-pricing'");
    const line = src.split('\n').find((l) => l.startsWith('const fmtINR')) ?? '';
    expect(line).toContain('rupees(');
    expect(line).not.toContain('toLocaleString');
  });
});
