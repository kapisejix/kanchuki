// H5-5 / RC-150 — the Ken Burns url fallback fetched photo.url with a bare fetch() and read the
// whole body. Source pin: the job runs the shared SSRF-safe fetch with the capped reader instead.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./generate-ken-burns-video.ts', import.meta.url), 'utf8');

describe('generate-ken-burns-video url fallback', () => {
  it('has no bare fetch() or unbounded arrayBuffer()', () => {
    expect(src).not.toMatch(/(?<![\w.])fetch\(/);
    expect(src).not.toMatch(/\.arrayBuffer\(\)/);
  });
  it('uses ssrfSafeFetch + readCappedBuffer', () => {
    expect(src).toMatch(/ssrfSafeFetch\(photo\.url\)/);
    expect(src).toMatch(/readCappedBuffer\(/);
  });
});
