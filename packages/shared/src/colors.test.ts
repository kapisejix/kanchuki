import { describe, expect, it } from 'vitest';
import { classifyColorTone } from './constants/index.js';

describe('classifyColorTone', () => {
  it('classifies known dark colors as dark', () => {
    // black #1c1917, navy blue #1a2b4c, maroon #7f1d1d — all low luminance.
    expect(classifyColorTone('Black')).toBe('dark');
    expect(classifyColorTone('Navy Blue')).toBe('dark');
    expect(classifyColorTone('Maroon')).toBe('dark');
    expect(classifyColorTone('Charcoal')).toBe('dark');
  });

  it('classifies known light colors as light', () => {
    // white #f5f5f4, cream #fffdd0, ivory #fffff0 — all high luminance.
    expect(classifyColorTone('White')).toBe('light');
    expect(classifyColorTone('Cream')).toBe('light');
    expect(classifyColorTone('Ivory')).toBe('light');
    expect(classifyColorTone('Off-White')).toBe('light');
  });

  it('returns null for unknown or unmapped names', () => {
    expect(classifyColorTone('Chartreuse')).toBeNull();
    expect(classifyColorTone('Forest Green')).toBeNull();
    expect(classifyColorTone(null)).toBeNull();
    expect(classifyColorTone(undefined)).toBeNull();
    expect(classifyColorTone('')).toBeNull();
  });

  it('treats case and whitespace case-insensitively', () => {
    expect(classifyColorTone('  bLaCk ')).toBe('dark');
  });

  it('returns null for mid-tone colors instead of guessing', () => {
    // tan #d2b48c → ~0.48 luminance — between the dark/light bands.
    expect(classifyColorTone('Tan')).toBeNull();
    expect(classifyColorTone('Khaki')).toBeNull();
  });
});
