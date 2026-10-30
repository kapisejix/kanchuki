import { describe, expect, it } from 'vitest';
import { nullOnMissing } from './prisma-errors.js';

describe('nullOnMissing', () => {
  it('returns null for P2025 (row missing) and P2002 (duplicate)', () => {
    expect(nullOnMissing({ code: 'P2025' })).toBeNull();
    expect(nullOnMissing({ code: 'P2002' })).toBeNull();
  });

  it('rethrows any other error unchanged', () => {
    const dbDown = Object.assign(new Error('refused'), { code: 'P1001' });
    expect(() => nullOnMissing(dbDown)).toThrow(dbDown);
    expect(() => nullOnMissing(new Error('plain'))).toThrow('plain');
  });

  it('rethrows null / undefined / non-objects without a TypeError', () => {
    expect(() => nullOnMissing(null)).toThrow();
    expect(() => nullOnMissing(undefined)).toThrow();
    expect(() => nullOnMissing('x')).toThrow('x');
  });
});
