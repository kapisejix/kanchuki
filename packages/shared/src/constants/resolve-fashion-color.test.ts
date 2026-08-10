import { describe, expect, it } from 'vitest';
import { resolveFashionColor } from './index.js';

describe('resolveFashionColor', () => {
  it('exact-matches a known alias', () => {
    expect(resolveFashionColor('navy blue')).toBe('#1a2b4c');
  });

  it('falls back to the longest contained alias for AI free-text names', () => {
    expect(resolveFashionColor('Dark Navy Blue')).toBe('#1a2b4c');
    expect(resolveFashionColor('Royal Blue')).toBe('#2563eb');
  });

  it('defaults to grey for a totally unknown color', () => {
    expect(resolveFashionColor('holographic')).toBe('#d1d5db');
  });
});
