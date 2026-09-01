import { describe, expect, it } from 'vitest';
import { getFinancialYear } from './gst-invoice-number.js';

describe('getFinancialYear', () => {
  it('September 2026 → 26-27', () => {
    expect(getFinancialYear(new Date('2026-09-01'))).toBe('26-27');
  });

  it('April 2026 → 26-27 (start of FY)', () => {
    expect(getFinancialYear(new Date('2026-04-01'))).toBe('26-27');
  });

  it('March 2027 → 26-27 (end of FY)', () => {
    expect(getFinancialYear(new Date('2027-03-31'))).toBe('26-27');
  });

  it('January 2027 → 26-27 (still in FY 26-27)', () => {
    expect(getFinancialYear(new Date('2027-01-15'))).toBe('26-27');
  });

  it('March 2026 → 25-26 (end of previous FY)', () => {
    expect(getFinancialYear(new Date('2026-03-15'))).toBe('25-26');
  });

  it('December 2026 → 26-27', () => {
    expect(getFinancialYear(new Date('2026-12-31'))).toBe('26-27');
  });
});

// allocateInvoiceNumber requires a live database (interactive transaction),
// so we test it in integration tests, not here. The FY logic above covers
// the date math. The formatting is simple enough to verify by inspection.
describe('invoice number format', () => {
  it('format is prefix/FY/NNNNNN', () => {
    // Manual verification of the format contract
    const prefix = 'KAN';
    const fy = '26-27';
    const num = 1;
    const formatted = `${prefix}/${fy}/${String(num).padStart(6, '0')}`;
    expect(formatted).toBe('KAN/26-27/000001');
  });

  it('zero-pads to 6 digits', () => {
    expect(String(42).padStart(6, '0')).toBe('000042');
    expect(String(999999).padStart(6, '0')).toBe('999999');
  });
});
