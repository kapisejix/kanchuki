import { describe, expect, it } from 'vitest';
import { isKidsProduct } from './my-style-look.js';

describe('isKidsProduct', () => {
  it.each([
    ['Kids Ethnic Wear', 'Kurta Set'],
    ['Kids', null],
    ['New Born', null],
    ['Ladies', 'Girls Frock'],
    ['Kids Ethnic Wear', 'N/A'],
  ])('%s / %s is kids', (category, subtype) => {
    expect(isKidsProduct({ category, subtype })).toBe(true);
  });
  it.each([
    ['Ladies Suit', 'Anarkali'],
    ['Saree', null],
    ["Men's Kurta Pajama", null],
    [null, null],
  ])('%s / %s is not kids', (category, subtype) => {
    expect(isKidsProduct({ category, subtype })).toBe(false);
  });
});
