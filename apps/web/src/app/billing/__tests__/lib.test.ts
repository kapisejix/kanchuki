import { describe, expect, it } from 'vitest';
import {
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

  it('formats full monthly prices — never abbreviated', () => {
    expect(planPriceLabel(499900)).toBe('₹4,999/mo');
    expect(planPriceLabel(999900)).toBe('₹9,999/mo');
    expect(planPriceLabel(1499900)).toBe('₹14,999/mo');
  });

  it('maps subscription statuses to friendly labels', () => {
    expect(planStatusLabel('ACTIVE')).toBe('Active');
    expect(planStatusLabel('TRIAL')).toBe('Free trial');
    expect(planStatusLabel('CANCELLED')).toBe('Cancelled');
    expect(planStatusLabel('PAST_DUE')).toBe('Payment due');
    expect(planStatusLabel(null)).toBe('Unknown');
    expect(planStatusLabel(undefined)).toBe('Unknown');
  });

  it('formats ISO dates in Indian style and tolerates empty input', () => {
    expect(formatDate('2026-09-01T00:00:00.000Z')).toMatch(/Sep/);
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});
