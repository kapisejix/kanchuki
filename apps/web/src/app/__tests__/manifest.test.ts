// F-036 Phase A (Task 2): the installed home-screen icon's entry point.
//
// A PWA's installability and its "this feels like an app" launch both come
// from manifest.json, and the one field that decides where the icon actually
// lands is `start_url`. It is a single string with no test coverage anywhere
// else in the repo, so an unrelated edit could silently point every installed
// icon at the marketing home page again — this pins it.
import { describe, expect, it } from 'vitest';
import manifest from '../../../public/manifest.json';

describe('PWA manifest', () => {
  it('opens the installed icon on the shopper store list, not the marketing home', () => {
    expect(manifest.start_url).toBe('/my-stores');
  });

  it('uses a root-relative start_url so the icon stays in the manifest scope', () => {
    // Absolute URLs, protocol-relative URLs (//host) and relative paths would
    // either escape the manifest's default scope or resolve unpredictably.
    expect(manifest.start_url.startsWith('/')).toBe(true);
    expect(manifest.start_url.startsWith('//')).toBe(false);
    expect(manifest.start_url).not.toMatch(/^[a-z]+:/i);
  });

  it('keeps the installable-icon ingredients the start_url depends on', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
  });
});
