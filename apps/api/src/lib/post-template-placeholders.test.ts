import { describe, expect, it } from 'vitest';
import { resolvePostTemplate } from './post-template-placeholders.js';

describe('resolvePostTemplate', () => {
  it('resolves every POST token', () => {
    const out = resolvePostTemplate(
      '✨ New {product_name} — ₹{price} in {category}! Visit {store_name}: {link}',
      {
        productName: 'Silk Saree',
        pricePaise: 150000,
        category: 'Sarees',
        storeName: 'Priya Cloth House',
        link: 'https://kanchuki.app/priya/silk-saree',
      },
    );
    expect(out).toBe(
      '✨ New Silk Saree — ₹1,500 in Sarees! Visit Priya Cloth House: https://kanchuki.app/priya/silk-saree',
    );
  });

  it('formats {price} with en-IN grouping, whole paise amounts, no ₹', () => {
    expect(resolvePostTemplate('{price}', { pricePaise: 150000 })).toBe('1,500');
    expect(resolvePostTemplate('{price}', { pricePaise: 49990 })).toBe('499.90');
    expect(resolvePostTemplate('₹{price}', { pricePaise: 1245000 })).toBe('₹12,450');
  });

  it('resolves {price} to empty when the product has no price', () => {
    expect(resolvePostTemplate('at ₹{price} only', { pricePaise: null })).toBe('at ₹ only');
  });

  it('joins {product_names} and caps at 3 with +N more', () => {
    const names = ['A', 'B', 'C', 'D', 'E'];
    expect(resolvePostTemplate('{product_names}', { productNames: names })).toBe('A, B, C +2 more');
  });

  it('joins up to 3 {product_names} without a suffix', () => {
    expect(resolvePostTemplate('{product_names}', { productNames: ['A', 'B'] })).toBe('A, B');
  });

  it('ignores blank names in {product_names}', () => {
    expect(resolvePostTemplate('{product_names}', { productNames: ['A', null, '', 'B'] })).toBe('A, B');
  });

  it('falls back to the first product name for {product_name}', () => {
    expect(
      resolvePostTemplate('{product_name}', { productNames: ['Kurti', 'Lehenga'] }),
    ).toBe('Kurti');
  });

  it('resolves {festival} and {store_name} for campaign context', () => {
    expect(
      resolvePostTemplate('{festival} sale at {store_name}', {
        festival: 'Diwali',
        storeName: 'Priya Cloth House',
      }),
    ).toBe('Diwali sale at Priya Cloth House');
  });

  it('drops missing tokens and collapses leftover double spaces', () => {
    expect(resolvePostTemplate('New {product_name} at just ₹{price}!')).toBe('New at just ₹!');
  });

  it('preserves intentional line breaks', () => {
    const out = resolvePostTemplate('Line one\n\nLine two — {product_name}', {
      productName: 'Kurti',
    });
    expect(out).toBe('Line one\n\nLine two — Kurti');
  });

  it('drops unknown {typo} tokens so a live post never shows a raw placeholder', () => {
    // {product_nme} is NOT a known token — dropped, not resolved.
    expect(resolvePostTemplate('Shop {product_nme} today', { productName: 'Kurti' })).toBe(
      'Shop today',
    );
    expect(resolvePostTemplate('Hello {store}')).toBe('Hello');
  });

  it('returns empty for an empty template', () => {
    expect(resolvePostTemplate('')).toBe('');
  });

  it('never throws on an empty context', () => {
    expect(() => resolvePostTemplate('Hi {product_name} {price} {link}')).not.toThrow();
  });
});