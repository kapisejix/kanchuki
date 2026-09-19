import { STUDIO_ENGINES } from '@kanchuki/shared';
import { describe, expect, it } from 'vitest';
import { FAL_EDIT_ENGINES, isFalEditEngine } from './fal-client.js';

describe('FAL_EDIT_ENGINES', () => {
  it('is a subset of STUDIO_ENGINES, so a bench value is always storable', () => {
    for (const key of Object.keys(FAL_EDIT_ENGINES)) expect(STUDIO_ENGINES).toContain(key);
  });

  it('never overrides the two fields the helper owns', () => {
    for (const { extra } of Object.values(FAL_EDIT_ENGINES)) {
      expect(extra).not.toHaveProperty('prompt');
      expect(extra).not.toHaveProperty('image_urls');
    }
  });

  it('uses slash-separated endpoint ids (the FASHN 404 was a dashed one)', () => {
    for (const { endpoint } of Object.values(FAL_EDIT_ENGINES)) {
      expect(endpoint).toMatch(/^[a-z0-9-]+(\/[a-z0-9.-]+)+$/);
    }
  });

  it('recognises its own engines and nothing else', () => {
    expect(isFalEditEngine('flux2_pro')).toBe(true);
    expect(isFalEditEngine('gemini_image')).toBe(false);
    expect(isFalEditEngine('toString')).toBe(false);
    expect(isFalEditEngine(undefined)).toBe(false);
  });
});
