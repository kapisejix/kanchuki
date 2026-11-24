import { describe, expect, it } from 'vitest';
import { inrFromPaise } from './format-inr';

describe('inrFromPaise (RC-109)', () => {
  it('shows paise as rupees, not ×100', () => {
    expect(inrFromPaise(210000)).toBe('₹2,100');
    expect(inrFromPaise(3816)).toBe('₹38.16');
  });
  it('keeps Indian digit grouping', () => {
    expect(inrFromPaise(12345678900)).toBe('₹12,34,56,789');
  });
  it('renders ₹0 for missing or NaN', () => {
    expect(inrFromPaise(undefined)).toBe('₹0');
    expect(inrFromPaise(null)).toBe('₹0');
    expect(inrFromPaise(Number.NaN)).toBe('₹0');
  });
});
