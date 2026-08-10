import { describe, expect, it } from 'vitest';
import {
  annualSavingsPercent,
  formatDate,
  planLabel,
  planPriceLabel,
  planStatusLabel,
} from '../lib';

describe('billing plan helpers', () => {
  it('labels plans from enum keys', () => {
    expect(planLabel('STARTER')).toBe('Starter');
    expect(planLabel('GROWTH')).toBe('Growth');
    expect(planLabel('PRO')).toBe('Pro');
    expect(planLabel('')).toBe('Starter');
  });

  it('formats full prices with period suffix — never abbreviated', () => {
    expect(planPriceLabel(99900, 'monthly')).toBe('₹999/mo');
    expect(planPriceLabel(249900, 'monthly')).toBe('₹2,499/mo');
    expect(planPriceLabel(999900, 'annual')).toBe('₹9,999/yr');
    expect(planPriceLabel(4999900, 'annual')).toBe('₹49,999/yr');
  });

  it('maps subscription statuses to friendly labels', () => {
    expect(planStatusLabel('ACTIVE')).toBe('Active');
    expect(planStatusLabel('TRIAL')).toBe('Free trial');
    expect(planStatusLabel('CANCELLED')).toBe('Cancelled');
    expect(planStatusLabel('PAST_DUE')).toBe('Payment due');
    expect(planStatusLabel(null)).toBe('Unknown');
    expect(planStatusLabel(undefined)).toBe('Unknown');
  });

  it('computes the annual discount percentage', () => {
    // ₹999 × 12 = ₹11,988 vs ₹9,999 → 17% (rounds down from 16.59)
    expect(annualSavingsPercent(99900, 999900)).toBe(17);
    // 20% is exactly the marketed discount
    expect(annualSavingsPercent(99900, 99900 * 12 * 0.8)).toBe(20);
    // No discount → 0, never negative
    expect(annualSavingsPercent(99900, 99900 * 12)).toBe(0);
    expect(annualSavingsPercent(99900, 99900 * 12 * 1.1)).toBe(0);
    expect(annualSavingsPercent(0, 100)).toBe(0);
  });

  it('formats ISO dates in Indian style and tolerates empty input', () => {
    expect(formatDate('2026-09-01T00:00:00.000Z')).toMatch(/Sep/);
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});
