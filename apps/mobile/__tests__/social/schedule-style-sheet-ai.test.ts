import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The scheduler's style sheet must not list AI poster styles: its slide-style route 404s on them
// (they render only through POST /me/ai-designs). Source pin; the screen is too heavy to mount.
describe('scheduler style sheet', () => {
  it('filters AI styles out of the design list', () => {
    const src = readFileSync('app/social/schedule/[id].tsx', 'utf8');
    expect(src).toMatch(
      /designList = \(designsQuery\.data\?\.data \?\? \[\]\)\.filter\(\(d\) => !d\.ai\)/,
    );
  });
});
