import { describe, expect, it } from 'vitest';
import {
  buildEnquiryMessage,
  formatPrice,
  formatPriceRange,
  INDIAN_MOBILE_REGEX,
  isValidIndianPhone,
  normalizeIndianPhone,
} from './utils/index.js';

describe('formatPrice', () => {
  it('formats whole rupees with Indian grouping and the /- marker', () => {
    expect(formatPrice(210000)).toBe('₹2,100/-');
    expect(formatPrice(49900)).toBe('₹499/-');
    expect(formatPrice(129900)).toBe('₹1,299/-');
  });

  it('never abbreviates large amounts (full lakh/crore figure)', () => {
    expect(formatPrice(15000000)).toBe('₹1,50,000/-');
    expect(formatPrice(210000000)).toBe('₹21,00,000/-');
  });

  it('shows paise when the amount is not a whole rupee', () => {
    expect(formatPrice(123450)).toBe('₹1,234.50/-');
    expect(formatPrice(5)).toBe('₹0.05/-');
  });

  it('returns an em dash for null/undefined', () => {
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice(undefined)).toBe('—');
  });
});

describe('formatPriceRange', () => {
  it('renders a single price when min and max are equal or max is absent', () => {
    expect(formatPriceRange(210000, 210000)).toBe('₹2,100/-');
    expect(formatPriceRange(210000, null)).toBe('₹2,100/-');
  });

  it('renders a range with one trailing /- on the final amount', () => {
    expect(formatPriceRange(49900, 69900)).toBe('₹499 – ₹699/-');
    expect(formatPriceRange(129900, 159900)).toBe('₹1,299 – ₹1,599/-');
  });

  it('returns "Price on request" when no price is set', () => {
    expect(formatPriceRange(null, null)).toBe('Price on request');
    expect(formatPriceRange(undefined, undefined)).toBe('Price on request');
  });
});

describe('isValidIndianPhone', () => {
  it('accepts valid 10-digit Indian mobile numbers starting 6–9', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true);
    expect(isValidIndianPhone('6123456789')).toBe(true);
    expect(isValidIndianPhone('7000000000')).toBe(true);
    expect(isValidIndianPhone('8999999999')).toBe(true);
  });

  it('accepts +91 / 91 / leading-0 prefixed forms', () => {
    expect(isValidIndianPhone('+919876543210')).toBe(true);
    expect(isValidIndianPhone('919876543210')).toBe(true);
    expect(isValidIndianPhone('0 98765 43210')).toBe(true);
    expect(isValidIndianPhone('+91 98765-43210')).toBe(true);
  });

  it('rejects numbers starting with 0–5 (landlines / invalid mobile prefixes)', () => {
    expect(isValidIndianPhone('0123456789')).toBe(false);
    expect(isValidIndianPhone('1234567890')).toBe(false);
    expect(isValidIndianPhone('5012345678')).toBe(false);
    expect(isValidIndianPhone('+911234567890')).toBe(false);
  });

  it('rejects too short / too long / non-numeric input', () => {
    expect(isValidIndianPhone('987654321')).toBe(false);
    expect(isValidIndianPhone('98765432101')).toBe(false);
    expect(isValidIndianPhone('98765')).toBe(false);
    expect(isValidIndianPhone('')).toBe(false);
    expect(isValidIndianPhone('98765432ab')).toBe(false);
    expect(isValidIndianPhone('abcdefghij')).toBe(false);
  });

  it('rejects anything with non-Indian country codes', () => {
    expect(isValidIndianPhone('+14445551234')).toBe(false);
    expect(isValidIndianPhone('447911123456')).toBe(false);
  });
});

describe('normalizeIndianPhone', () => {
  it('strips country prefixes to the bare 10-digit number', () => {
    expect(normalizeIndianPhone('+919876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('919876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
  });

  it('passes through a bare 10-digit number unchanged', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('9876543210');
  });
});

describe('INDIAN_MOBILE_REGEX', () => {
  it('matches only 10 digits starting 6–9', () => {
    expect(INDIAN_MOBILE_REGEX.test('9876543210')).toBe(true);
    expect(INDIAN_MOBILE_REGEX.test('1876543210')).toBe(false);
    expect(INDIAN_MOBILE_REGEX.test('987654321')).toBe(false);
  });
});

describe('buildEnquiryMessage', () => {
  const base = {
    shopName: 'Radha Clothing Store',
    collectionTitle: 'All Products',
  };

  it('keeps the classic bullet format when no product_url is given', () => {
    const message = buildEnquiryMessage({
      ...base,
      products: [{ name: 'Pink Embroidered Kurti', price_min: 110000 }],
    });
    expect(message).toContain("• Pink Embroidered Kurti - ₹1,100/-");
    expect(message).not.toContain('http');
  });

  it('appends the product URL under the matching bullet when provided', () => {
    const message = buildEnquiryMessage({
      ...base,
      products: [
        {
          name: 'Pink Embroidered Kurti',
          price_min: 110000,
          product_url: 'https://kanchuki.app/radha-store/festive/product/abc123',
        },
      ],
    });
    expect(message).toBe(`Namaste! I saw your collection "All Products" from Radha Clothing Store.

I'm interested in:
• Pink Embroidered Kurti - ₹1,100/-
  https://kanchuki.app/radha-store/festive/product/abc123

Please share availability and details. 🙏`);
  });

  it('renders one URL line per product, each under its own bullet', () => {
    const message = buildEnquiryMessage({
      ...base,
      products: [
        { name: 'Kurti A', price_min: 100000, product_url: 'https://k.app/a' },
        { name: 'Kurti B', price_min: null, product_url: 'https://k.app/b' },
      ],
    });
    expect(message).toContain('• Kurti A - ₹1,000/-\n  https://k.app/a');
    expect(message).toContain('• Kurti B \n  https://k.app/b');
  });
});
