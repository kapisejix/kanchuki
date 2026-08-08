import { describe, expect, it } from 'vitest';
import { INDIAN_MOBILE_REGEX, isValidIndianPhone, normalizeIndianPhone } from './utils/index.js';

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
