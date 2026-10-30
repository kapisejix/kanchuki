// RC-106: the service worker must never write personal responses into Cache Storage.
//
// Serwist's `defaultCache` caches every same-origin GET /api/* (NetworkFirst, 24 h) and every
// cross-origin GET (1 h), so /api/passport/me, the data export and the retailer's Bearer-token
// /v1/retailers/* calls landed in the `apis` / `cross-origin` caches and were replayed to the next
// person on a shared phone. The worker has no runtime harness here, so this reads the source:
// it fails if the NetworkOnly rule goes missing, moves below `defaultCache`, or loses the
// /v1/public carve-out, or if the one-time cleanup of the old caches is dropped.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(path.resolve(__dirname, '../../app/sw.ts'), 'utf8');

describe('service worker personal-data caching (RC-106)', () => {
  it('sends /api/ and non-public /v1/ to NetworkOnly before defaultCache', () => {
    const marker = src.indexOf('RC-106: personal responses');
    const fallback = src.indexOf('...defaultCache');
    expect(marker).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(marker);

    const rule = src.slice(marker, fallback);
    expect(rule).toContain("url.pathname.startsWith('/api/')");
    expect(rule).toContain("url.pathname.startsWith('/v1/')");
    expect(rule).toContain("!url.pathname.startsWith('/v1/public/')");
    expect(rule).toContain('new NetworkOnly()');
  });

  it('keeps the public collection proxies on their explicit rule above it', () => {
    const publicProxies = src.indexOf("cacheName: 'collection-api'");
    const marker = src.indexOf('RC-106: personal responses');
    expect(publicProxies).toBeGreaterThan(-1);
    expect(publicProxies).toBeLessThan(marker);
  });

  it('deletes the caches the old rules filled when a new worker activates', () => {
    expect(src).toContain("sw.addEventListener('activate'");
    expect(src).toContain("['apis', 'cross-origin']");
    expect(src).toContain('caches.delete(name)');
  });
});
